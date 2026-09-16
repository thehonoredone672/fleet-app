const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { can } = require('../constants/permissions');
const storageService = require('./storageService');
const auditService = require('./auditService');

const INCLUDE = { vehicle: true, driver: true };

// Resolves + authorizes "what this document is (or will be) for," used
// by both getUploadCredentials and create — a driver may only act on
// their own Driver record; every other role needs the `documents`
// permission plus their org actually containing the vehicle/driver.
// Routes are deliberately not `authorize`-gated (same pattern as
// fuel/expenses) since a driver's ownership path and an admin's matrix
// path both need to reach the same handler.
const resolveSubject = async (requestingUser, { vehicleId, driverId }) => {
  if (requestingUser.role === 'DRIVER') {
    if (!driverId) {
      throw new AppError('Drivers can only upload their own documents', 403);
    }
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || driver.userId !== requestingUser.id) {
      throw new AppError('Document not found', 404);
    }
    return { organizationId: driver.organizationId };
  }

  if (!can(requestingUser.role, 'documents', 'create')) {
    throw new AppError('You do not have permission to perform this action', 403);
  }

  if (vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new AppError('Vehicle not found', 404);
    assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');
    return { organizationId: vehicle.organizationId };
  }

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new AppError('Driver not found', 404);
  assertInScope(requestingUser, driver.organizationId, 'Driver not found');
  return { organizationId: driver.organizationId };
};

// Checks access to an *existing* Document — a driver may only touch a
// document linked to their own Driver record; every other role needs the
// `documents` permission for the given action plus org scope. Existence
// is hidden (404, not 403) from a driver who doesn't own it, same
// cross-org-hiding rationale used everywhere else.
const assertCanAccessDocument = (requestingUser, document, action) => {
  if (requestingUser.role === 'DRIVER') {
    if (document.driverId && document.driver?.userId === requestingUser.id) return;
    throw new AppError('Document not found', 404);
  }

  if (!can(requestingUser.role, 'documents', action)) {
    throw new AppError('You do not have permission to perform this action', 403);
  }

  const organizationId = document.vehicle?.organizationId ?? document.driver?.organizationId;
  assertInScope(requestingUser, organizationId, 'Document not found');
};

// Issues a short-lived signed upload credential the *client* uploads
// directly to storage with — see storageService.js. Validates the
// subject up front so a caller can't get a valid signed URL for a
// vehicle/driver they have no business attaching files to.
const getUploadCredentials = async (requestingUser, data) => {
  const { organizationId } = await resolveSubject(requestingUser, data);
  const subjectId = data.vehicleId || data.driverId;
  const folder = `documents/${organizationId}/${subjectId}`;
  return storageService.getUploadCredentials({ folder, contentType: data.contentType });
};

const create = async (requestingUser, data, context = {}) => {
  await resolveSubject(requestingUser, data);

  const document = await prisma.document.create({
    data: {
      vehicleId: data.vehicleId || null,
      driverId: data.driverId || null,
      type: data.type,
      documentNumber: data.documentNumber,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      fileUrl: data.fileUrl,
    },
    include: INCLUDE,
  });

  await auditService.log(requestingUser.id, 'CREATE_DOCUMENT', 'Document', document.id, context, { type: document.type });
  return document;
};

const list = async (requestingUser, query) => {
  const { page, limit, vehicleId, driverId, type, expiringBefore, organizationId } = query;

  let where;
  if (requestingUser.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: requestingUser.id } });
    if (!driver) throw new AppError('Driver profile not found', 404);
    where = { driverId: driver.id };
  } else {
    if (!can(requestingUser.role, 'documents', 'read')) {
      throw new AppError('You do not have permission to perform this action', 403);
    }
    const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;
    where = {
      ...(vehicleId && { vehicleId }),
      ...(driverId && { driverId }),
      ...(scopeOrgId && { OR: [{ vehicle: { organizationId: scopeOrgId } }, { driver: { organizationId: scopeOrgId } }] }),
    };
  }

  if (type) where.type = type;
  if (expiringBefore) where.expiryDate = { lte: expiringBefore };

  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: INCLUDE }),
    prisma.document.count({ where }),
  ]);

  return { documents: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const getOne = async (requestingUser, documentId) => {
  const document = await prisma.document.findUnique({ where: { id: documentId }, include: INCLUDE });
  if (!document) throw new AppError('Document not found', 404);
  assertCanAccessDocument(requestingUser, document, 'read');
  return document;
};

const update = async (requestingUser, documentId, data, context = {}) => {
  const existing = await prisma.document.findUnique({ where: { id: documentId }, include: INCLUDE });
  if (!existing) throw new AppError('Document not found', 404);
  assertCanAccessDocument(requestingUser, existing, 'update');

  // Replacing the file: the old one in storage is orphaned unless we
  // clean it up — best-effort, doesn't block the metadata update.
  if (data.fileUrl && data.fileUrl !== existing.fileUrl) {
    await storageService.deleteFile(existing.fileUrl);
  }

  const updated = await prisma.document.update({ where: { id: documentId }, data, include: INCLUDE });
  await auditService.log(requestingUser.id, 'UPDATE_DOCUMENT', 'Document', documentId, context, data);
  return updated;
};

// Hard delete — unlike Vehicle/Driver/Trip, nothing has a Restrict FK to
// Document, and a stale/expired/replaced document genuinely should be
// removable rather than kept as permanent soft-deleted clutter.
const remove = async (requestingUser, documentId, context = {}) => {
  const existing = await prisma.document.findUnique({ where: { id: documentId }, include: INCLUDE });
  if (!existing) throw new AppError('Document not found', 404);
  assertCanAccessDocument(requestingUser, existing, 'delete');

  await prisma.document.delete({ where: { id: documentId } });
  await storageService.deleteFile(existing.fileUrl);
  await auditService.log(requestingUser.id, 'DELETE_DOCUMENT', 'Document', documentId, context);
};

module.exports = { getUploadCredentials, create, list, getOne, update, remove };
