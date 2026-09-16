const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { USER_SUMMARY_SELECT } = require('../utils/prismaSelects');
const auditService = require('./auditService');

const INCLUDE = {
  vehicle: true,
  driver: { include: { user: { select: USER_SUMMARY_SELECT } } },
};

const list = async (requestingUser, query) => {
  const { page, limit, vehicleId, driverId, isActive, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const where = {
    ...(scopeOrgId && { vehicle: { organizationId: scopeOrgId } }),
    ...(vehicleId && { vehicleId }),
    ...(driverId && { driverId }),
    ...(isActive !== undefined && { isActive }),
  };

  const [items, total] = await Promise.all([
    prisma.vehicleAssignment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { assignedAt: 'desc' },
      include: INCLUDE,
    }),
    prisma.vehicleAssignment.count({ where }),
  ]);

  return {
    assignments: items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getOne = async (requestingUser, assignmentId) => {
  const assignment = await prisma.vehicleAssignment.findUnique({
    where: { id: assignmentId },
    include: INCLUDE,
  });
  if (!assignment) throw new AppError('Assignment not found', 404);
  assertInScope(requestingUser, assignment.vehicle.organizationId, 'Assignment not found');
  return assignment;
};

// Enforces "one active driver per vehicle, one active vehicle per driver"
// (§48 of the product spec). The check-then-create here is wrapped in a
// transaction for read-your-write consistency, but the real guarantee
// against a race between two concurrent requests is the partial unique
// index documented in docs/database.md#manual-step-partial-unique-indexes
// — this app-level check exists to turn that DB constraint violation into
// a clean 409 instead of a raw Prisma error, not to replace it.
const create = async (requestingUser, data, context = {}) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');

  const driver = await prisma.driver.findUnique({ where: { id: data.driverId } });
  if (!driver) throw new AppError('Driver not found', 404);

  if (driver.organizationId !== vehicle.organizationId) {
    throw new AppError('Vehicle and driver must belong to the same organization', 400);
  }

  if (vehicle.status === 'RETIRED') {
    throw new AppError('Cannot assign a retired vehicle', 400);
  }
  if (driver.status !== 'ACTIVE') {
    throw new AppError('Only an active driver can be assigned to a vehicle', 400);
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const [vehicleTaken, driverTaken] = await Promise.all([
      tx.vehicleAssignment.findFirst({ where: { vehicleId: vehicle.id, isActive: true } }),
      tx.vehicleAssignment.findFirst({ where: { driverId: driver.id, isActive: true } }),
    ]);

    if (vehicleTaken) throw new AppError('Vehicle already has an active driver assigned', 409);
    if (driverTaken) throw new AppError('Driver is already assigned to a vehicle', 409);

    return tx.vehicleAssignment.create({
      data: { vehicleId: vehicle.id, driverId: driver.id },
      include: INCLUDE,
    });
  });

  await auditService.log(requestingUser.id, 'CREATE_ASSIGNMENT', 'VehicleAssignment', assignment.id, context, {
    vehicleId: vehicle.id,
    driverId: driver.id,
  });

  return assignment;
};

// Shared by any service that needs "the vehicle this driver is currently
// allowed to act on" — location ingestion and fuel record submission both
// require the caller to be a driver with an active assignment before
// trusting anything else in their payload.
const requireActiveAssignmentForDriver = async (requestingUser) => {
  if (requestingUser.role !== 'DRIVER') {
    throw new AppError('Only a driver can perform this action', 403);
  }

  const driver = await prisma.driver.findUnique({ where: { userId: requestingUser.id } });
  if (!driver) throw new AppError('Driver profile not found', 404);

  const assignment = await prisma.vehicleAssignment.findFirst({
    where: { driverId: driver.id, isActive: true },
  });
  if (!assignment) throw new AppError('You have no vehicle currently assigned', 400);

  return { driver, assignment };
};

const unassign = async (requestingUser, assignmentId, context = {}) => {
  const assignment = await prisma.vehicleAssignment.findUnique({
    where: { id: assignmentId },
    include: { vehicle: true },
  });
  if (!assignment) throw new AppError('Assignment not found', 404);
  assertInScope(requestingUser, assignment.vehicle.organizationId, 'Assignment not found');

  if (!assignment.isActive) {
    throw new AppError('Assignment is already inactive', 400);
  }

  const updated = await prisma.vehicleAssignment.update({
    where: { id: assignmentId },
    data: { isActive: false, unassignedAt: new Date() },
    include: INCLUDE,
  });

  await auditService.log(requestingUser.id, 'UNASSIGN_VEHICLE', 'VehicleAssignment', assignmentId, context);
  return updated;
};

module.exports = { list, getOne, create, unassign, requireActiveAssignmentForDriver };
