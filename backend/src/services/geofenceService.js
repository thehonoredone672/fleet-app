const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { haversineDistanceMeters } = require('../utils/geo');
const { getIO } = require('../sockets/ioInstance');
const { orgFleetRoom } = require('../sockets/rooms');
const notificationService = require('./notificationService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

const list = async (requestingUser, query) => {
  const { page, limit, isActive, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const where = { ...(scopeOrgId && { organizationId: scopeOrgId }), ...(isActive !== undefined && { isActive }) };

  const [items, total] = await Promise.all([
    prisma.geofence.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.geofence.count({ where }),
  ]);

  return { geofences: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const getOne = async (requestingUser, geofenceId) => {
  const geofence = await prisma.geofence.findUnique({ where: { id: geofenceId } });
  if (!geofence) throw new AppError('Geofence not found', 404);
  assertInScope(requestingUser, geofence.organizationId, 'Geofence not found');
  return geofence;
};

const create = async (requestingUser, data, context = {}) => {
  const organizationId =
    requestingUser.role === 'SUPER_ADMIN' && data.organizationId ? data.organizationId : requestingUser.organizationId;

  const { organizationId: _ignored, ...geofenceData } = data;
  const geofence = await prisma.geofence.create({ data: { ...geofenceData, organizationId } });

  await auditService.log(requestingUser.id, 'CREATE_GEOFENCE', 'Geofence', geofence.id, context, { name: geofence.name });
  return geofence;
};

const update = async (requestingUser, geofenceId, data, context = {}) => {
  const existing = await prisma.geofence.findUnique({ where: { id: geofenceId } });
  if (!existing) throw new AppError('Geofence not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Geofence not found');

  const updated = await prisma.geofence.update({ where: { id: geofenceId }, data });
  await auditService.log(requestingUser.id, 'UPDATE_GEOFENCE', 'Geofence', geofenceId, context, data);
  return updated;
};

// Soft delete, consistent with the rest of the app — `isActive` was
// already part of the schema for exactly this.
const deactivate = async (requestingUser, geofenceId, context = {}) => {
  const existing = await prisma.geofence.findUnique({ where: { id: geofenceId } });
  if (!existing) throw new AppError('Geofence not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Geofence not found');

  if (!existing.isActive) {
    throw new AppError('Geofence is already inactive', 400);
  }

  const updated = await prisma.geofence.update({ where: { id: geofenceId }, data: { isActive: false } });
  await auditService.log(requestingUser.id, 'DEACTIVATE_GEOFENCE', 'Geofence', geofenceId, context);
  return updated;
};

// Called from locationService.ingest() for every accepted GPS point.
// State (inside/outside) is derived from the *last* GeofenceEvent for
// each (geofence, vehicle) pair rather than re-deriving it from the
// previous raw location — simpler, and immune to how sparse or bursty
// the incoming points are. Points must be checked in chronological
// order within a batch for this to produce correct transitions.
const checkGeofenceTransitions = async ({ organizationId, vehicleId, latitude, longitude, timestamp }) => {
  const geofences = await prisma.geofence.findMany({ where: { organizationId, isActive: true } });
  if (geofences.length === 0) return [];

  const events = [];

  for (const geofence of geofences) {
    const distance = haversineDistanceMeters(latitude, longitude, geofence.latitude, geofence.longitude);
    const isInside = distance <= geofence.radiusMeters;

    const lastEvent = await prisma.geofenceEvent.findFirst({
      where: { geofenceId: geofence.id, vehicleId },
      orderBy: { occurredAt: 'desc' },
    });
    const wasInside = lastEvent?.type === 'ENTERED';

    if (isInside === wasInside) continue;

    const type = isInside ? 'ENTERED' : 'EXITED';
    const event = await prisma.geofenceEvent.create({
      data: { geofenceId: geofence.id, vehicleId, type, occurredAt: timestamp || new Date() },
    });
    events.push(event);

    const io = getIO();
    if (io) io.to(orgFleetRoom(organizationId)).emit('geofence:event', { ...event, geofenceName: geofence.name });

    if (geofence.notifyOnEvent) {
      const message = `Vehicle ${type === 'ENTERED' ? 'entered' : 'exited'} geofence "${geofence.name}"`;
      await prisma.alert.create({
        data: { organizationId, vehicleId, type: 'GEOFENCE_BREACH', severity: 'LOW', message },
      });
      await notificationService
        .notifyOrgManagers(organizationId, { title: 'Geofence event', message, type: 'ALERT' })
        .catch((err) => logger.error('Failed to notify managers of geofence event', { message: err.message }));
    }
  }

  return events;
};

module.exports = { list, getOne, create, update, deactivate, checkGeofenceTransitions };
