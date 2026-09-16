const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const auditService = require('./auditService');

const INCLUDE = { vehicle: true };

// §14 of the product spec: "Next service at: 50,000 km, Current: 48,700
// km, Alert: Service due in 1,300 km." — a read-time computed field, not
// stored; the actual proactive alert generation (30/15/7/1 days before,
// or a mileage threshold) needs the BullMQ background-job infrastructure
// from a later phase and isn't built here.
const withMileageDue = (maintenance) => ({
  ...maintenance,
  kmUntilService:
    maintenance.nextServiceMileage != null ? maintenance.nextServiceMileage - maintenance.vehicle.currentMileage : null,
});

const list = async (requestingUser, query) => {
  const { page, limit, vehicleId, status, type, dueBefore, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const where = {
    ...(scopeOrgId && { vehicle: { organizationId: scopeOrgId } }),
    ...(vehicleId && { vehicleId }),
    ...(status && { status }),
    ...(type && { type }),
    ...(dueBefore && { nextServiceDate: { lte: dueBefore } }),
  };

  const [items, total] = await Promise.all([
    prisma.maintenance.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    }),
    prisma.maintenance.count({ where }),
  ]);

  return {
    maintenance: items.map(withMileageDue),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getOne = async (requestingUser, maintenanceId) => {
  const record = await prisma.maintenance.findUnique({ where: { id: maintenanceId }, include: INCLUDE });
  if (!record) throw new AppError('Maintenance record not found', 404);
  assertInScope(requestingUser, record.vehicle.organizationId, 'Maintenance record not found');
  return withMileageDue(record);
};

const create = async (requestingUser, data, context = {}) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');

  const status = data.status || 'SCHEDULED';
  const ops = [
    prisma.maintenance.create({
      data: { ...data, status, createdById: requestingUser.id },
      include: INCLUDE,
    }),
  ];

  if (status === 'IN_PROGRESS' && vehicle.status !== 'MAINTENANCE') {
    ops.unshift(prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'MAINTENANCE' } }));
  }

  const results = await prisma.$transaction(ops);
  const record = results[results.length - 1];

  await auditService.log(requestingUser.id, 'CREATE_MAINTENANCE', 'Maintenance', record.id, context, {
    vehicleId: vehicle.id,
    type: record.type,
  });

  return withMileageDue(record);
};

// Keeps Vehicle.status in sync with maintenance state (§48: "a vehicle
// under maintenance cannot start a new trip" only means something if
// something actually sets the vehicle to MAINTENANCE): starting a
// maintenance job puts the vehicle into MAINTENANCE; finishing or
// cancelling the last in-progress job on that vehicle returns it to
// ACTIVE. A terminal record (COMPLETED/CANCELLED) can no longer be
// edited at all, same finality rule as a SCHEDULED-only Trip edit window.
const update = async (requestingUser, maintenanceId, data, context = {}) => {
  const existing = await prisma.maintenance.findUnique({ where: { id: maintenanceId }, include: INCLUDE });
  if (!existing) throw new AppError('Maintenance record not found', 404);
  assertInScope(requestingUser, existing.vehicle.organizationId, 'Maintenance record not found');

  if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
    throw new AppError(`Cannot update a maintenance record that is already ${existing.status}`, 400);
  }

  const wasInProgress = existing.status === 'IN_PROGRESS';
  const nextStatus = data.status || existing.status;
  const willBeInProgress = nextStatus === 'IN_PROGRESS';

  const ops = [];

  if (!wasInProgress && willBeInProgress) {
    ops.push(prisma.vehicle.update({ where: { id: existing.vehicleId }, data: { status: 'MAINTENANCE' } }));
  } else if (wasInProgress && !willBeInProgress) {
    const otherInProgress = await prisma.maintenance.count({
      where: { vehicleId: existing.vehicleId, status: 'IN_PROGRESS', id: { not: maintenanceId } },
    });
    const mileageUpdate =
      nextStatus === 'COMPLETED' && data.mileage != null
        ? { currentMileage: Math.max(existing.vehicle.currentMileage, data.mileage) }
        : {};
    if (otherInProgress === 0 || Object.keys(mileageUpdate).length > 0) {
      ops.push(
        prisma.vehicle.update({
          where: { id: existing.vehicleId },
          data: { ...(otherInProgress === 0 && { status: 'ACTIVE' }), ...mileageUpdate },
        })
      );
    }
  }

  ops.push(prisma.maintenance.update({ where: { id: maintenanceId }, data, include: INCLUDE }));

  const results = await prisma.$transaction(ops);
  const updated = results[results.length - 1];

  await auditService.log(requestingUser.id, 'UPDATE_MAINTENANCE', 'Maintenance', maintenanceId, context, data);
  return withMileageDue(updated);
};

module.exports = { list, getOne, create, update };
