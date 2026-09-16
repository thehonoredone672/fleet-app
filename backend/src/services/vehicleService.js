const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { USER_SUMMARY_SELECT } = require('../utils/prismaSelects');
const auditService = require('./auditService');

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

// Embeds the vehicle's current active assignment (if any) so list/detail
// responses can show "Driver" per the product spec (§12) without a
// separate round trip. Flattened to `assignedDriver` rather than left as
// a 0-or-1-item array.
const ACTIVE_ASSIGNMENT_INCLUDE = {
  assignments: {
    where: { isActive: true },
    take: 1,
    include: { driver: { include: { user: { select: USER_SUMMARY_SELECT } } } },
  },
};

const withAssignedDriver = (vehicle) => {
  const { assignments, ...rest } = vehicle;
  return { ...rest, assignedDriver: assignments?.[0]?.driver ?? null };
};

// Prisma throws a generic P2002 on the (organizationId, registrationNumber)
// unique constraint — translate it into a clean, specific API error rather
// than leaking a raw Prisma error through errorMiddleware.
const withDuplicateRegistrationHandling = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err.code === UNIQUE_CONSTRAINT_ERROR) {
      throw new AppError('A vehicle with this registration number already exists', 409);
    }
    throw err;
  }
};

const list = async (requestingUser, query) => {
  const { page, limit, search, status, vehicleType, organizationId } = query;

  const where = {
    organizationId: requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId,
    ...(status && { status }),
    ...(vehicleType && { vehicleType }),
    ...(search && {
      OR: [
        { registrationNumber: { contains: search, mode: 'insensitive' } },
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: ACTIVE_ASSIGNMENT_INCLUDE,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    vehicles: items.map(withAssignedDriver),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getOne = async (requestingUser, vehicleId) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: ACTIVE_ASSIGNMENT_INCLUDE,
  });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');
  return withAssignedDriver(vehicle);
};

// The vehicle currently assigned to a given driver (identified by their
// User id) — backs GET /vehicles/me, the driver's own "my vehicle" view.
const getAssignedToDriverUser = async (userId) => {
  const assignment = await prisma.vehicleAssignment.findFirst({
    where: { isActive: true, driver: { userId } },
    include: { vehicle: { include: ACTIVE_ASSIGNMENT_INCLUDE } },
  });
  if (!assignment) throw new AppError('No vehicle is currently assigned to you', 404);
  return withAssignedDriver(assignment.vehicle);
};

const create = async (requestingUser, data, context = {}) => {
  const organizationId =
    requestingUser.role === 'SUPER_ADMIN' && data.organizationId
      ? data.organizationId
      : requestingUser.organizationId;

  const { organizationId: _ignored, ...vehicleData } = data;

  const vehicle = await withDuplicateRegistrationHandling(() =>
    prisma.vehicle.create({ data: { ...vehicleData, organizationId } })
  );

  await auditService.log(requestingUser.id, 'CREATE_VEHICLE', 'Vehicle', vehicle.id, context, {
    registrationNumber: vehicle.registrationNumber,
  });

  return vehicle;
};

const update = async (requestingUser, vehicleId, data, context = {}) => {
  const existing = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!existing) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Vehicle not found');

  const updated = await withDuplicateRegistrationHandling(() =>
    prisma.vehicle.update({ where: { id: vehicleId }, data })
  );

  await auditService.log(requestingUser.id, 'UPDATE_VEHICLE', 'Vehicle', vehicleId, context, data);
  return updated;
};

// Soft delete only — vehicles are referenced by historical trip,
// maintenance, fuel, expense, and issue records (all `Restrict` on
// delete; see docs/database.md), so retiring sets status instead of
// removing the row.
const retire = async (requestingUser, vehicleId, context = {}) => {
  const existing = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!existing) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Vehicle not found');

  if (existing.status === 'RETIRED') {
    throw new AppError('Vehicle is already retired', 400);
  }

  const updated = await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'RETIRED' } });
  await auditService.log(requestingUser.id, 'RETIRE_VEHICLE', 'Vehicle', vehicleId, context);

  return updated;
};

module.exports = { list, getOne, getAssignedToDriverUser, create, update, retire };
