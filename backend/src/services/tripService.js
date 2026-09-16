const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { USER_SUMMARY_SELECT } = require('../utils/prismaSelects');
const auditService = require('./auditService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');
const { assertTransition } = require('../utils/tripStateMachine');

// Notification delivery is a side effect of the trip write, never a
// reason for it to fail — a broken notification should show up in logs,
// not as a 500 on trip creation/cancellation.
const notifySafely = (userId, payload) =>
  notificationService.notify(userId, payload).catch((err) => logger.error('Failed to send notification', { message: err.message }));

const INCLUDE = {
  vehicle: true,
  driver: { include: { user: { select: USER_SUMMARY_SELECT } } },
};

// start/pause/resume/end are driver actions (§9) — allowed for the
// specific driver assigned to the trip, or as a dispatcher override for
// the roles that can otherwise manage trips. Not expressible as a simple
// role→resource grant, so it's checked here rather than via `authorize`.
const assertCanOperateTrip = (requestingUser, trip) => {
  const isOwner = trip.driver.userId === requestingUser.id;
  const isOverrideRole = ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER'].includes(requestingUser.role);
  if (!isOwner && !isOverrideRole) {
    throw new AppError('You are not authorized to operate this trip', 403);
  }
};

const dateRangeFilter = (dateFrom, dateTo) =>
  dateFrom || dateTo
    ? { scheduledAt: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }
    : {};

const list = async (requestingUser, query) => {
  const { page, limit, status, driverId, vehicleId, dateFrom, dateTo, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const where = {
    ...(scopeOrgId && { organizationId: scopeOrgId }),
    ...(status && { status }),
    ...(driverId && { driverId }),
    ...(vehicleId && { vehicleId }),
    ...dateRangeFilter(dateFrom, dateTo),
  };

  const [items, total] = await Promise.all([
    prisma.trip.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: INCLUDE }),
    prisma.trip.count({ where }),
  ]);

  return { trips: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const listOwn = async (driverUserId, query) => {
  const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
  if (!driver) throw new AppError('Driver profile not found', 404);

  const { page, limit, status, dateFrom, dateTo } = query;
  const where = { driverId: driver.id, ...(status && { status }), ...dateRangeFilter(dateFrom, dateTo) };

  const [items, total] = await Promise.all([
    prisma.trip.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: INCLUDE }),
    prisma.trip.count({ where }),
  ]);

  return { trips: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const getOne = async (requestingUser, tripId) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: INCLUDE });
  if (!trip) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, trip.organizationId, 'Trip not found');
  return trip;
};

// Validates the vehicle/driver pair and the two creation-time business
// rules from §48: a retired vehicle can't be scheduled, and a driver with
// an expired license (or who isn't ACTIVE) can't be assigned a trip.
const create = async (requestingUser, data, context = {}) => {
  const organizationId =
    requestingUser.role === 'SUPER_ADMIN' && data.organizationId ? data.organizationId : requestingUser.organizationId;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');

  const driver = await prisma.driver.findUnique({ where: { id: data.driverId } });
  if (!driver) throw new AppError('Driver not found', 404);
  if (driver.organizationId !== vehicle.organizationId) {
    throw new AppError('Vehicle and driver must belong to the same organization', 400);
  }

  if (vehicle.status === 'RETIRED') {
    throw new AppError('Cannot schedule a trip for a retired vehicle', 400);
  }
  if (driver.status !== 'ACTIVE') {
    throw new AppError('Only an active driver can be assigned a trip', 400);
  }
  if (driver.licenseExpiry < new Date()) {
    throw new AppError("Driver's license has expired and cannot be assigned a trip", 400);
  }

  const { organizationId: _ignored, ...tripData } = data;
  const trip = await prisma.trip.create({
    data: { ...tripData, organizationId },
    include: INCLUDE,
  });

  await auditService.log(requestingUser.id, 'CREATE_TRIP', 'Trip', trip.id, context, {
    vehicleId: vehicle.id,
    driverId: driver.id,
  });
  await notifySafely(trip.driver.user.id, {
    title: 'New trip assigned',
    message: `${trip.source} → ${trip.destination}`,
    type: 'TRIP_ASSIGNED',
  });

  return trip;
};

const update = async (requestingUser, tripId, data, context = {}) => {
  const existing = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!existing) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Trip not found');

  if (existing.status !== 'SCHEDULED') {
    throw new AppError('Trip details can only be edited while it is still scheduled', 400);
  }

  const updated = await prisma.trip.update({ where: { id: tripId }, data, include: INCLUDE });
  await auditService.log(requestingUser.id, 'UPDATE_TRIP', 'Trip', tripId, context, data);
  return updated;
};

const cancel = async (requestingUser, tripId, context = {}) => {
  const existing = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!existing) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Trip not found');

  assertTransition(existing, 'cancel');
  const updated = await prisma.trip.update({ where: { id: tripId }, data: { status: 'CANCELLED' }, include: INCLUDE });
  await auditService.log(requestingUser.id, 'CANCEL_TRIP', 'Trip', tripId, context);
  await notifySafely(updated.driver.user.id, {
    title: 'Trip cancelled',
    message: `${updated.source} → ${updated.destination} was cancelled`,
    type: 'TRIP_UPDATED',
  });
  return updated;
};

// Live GPS capture (current position, continuous tracking) integrates
// here in Phase 9 — this records the odometer/coordinate the client
// already has at the moment of the action.
const start = async (requestingUser, tripId, data, context = {}) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: INCLUDE });
  if (!trip) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, trip.organizationId, 'Trip not found');
  assertCanOperateTrip(requestingUser, trip);
  assertTransition(trip, 'start');

  if (trip.vehicle.status !== 'ACTIVE') {
    throw new AppError(`Vehicle is not available to start a trip (status: ${trip.vehicle.status})`, 400);
  }

  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: {
      status: 'IN_PROGRESS',
      startTime: new Date(),
      startOdometer: data.startOdometer ?? trip.startOdometer,
      ...(data.sourceLat !== undefined && { sourceLat: data.sourceLat }),
      ...(data.sourceLng !== undefined && { sourceLng: data.sourceLng }),
    },
    include: INCLUDE,
  });

  await auditService.log(requestingUser.id, 'START_TRIP', 'Trip', tripId, context);
  return updated;
};

const pause = async (requestingUser, tripId, context = {}) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: INCLUDE });
  if (!trip) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, trip.organizationId, 'Trip not found');
  assertCanOperateTrip(requestingUser, trip);
  assertTransition(trip, 'pause');

  const updated = await prisma.trip.update({ where: { id: tripId }, data: { status: 'PAUSED' }, include: INCLUDE });
  await auditService.log(requestingUser.id, 'PAUSE_TRIP', 'Trip', tripId, context);
  return updated;
};

const resume = async (requestingUser, tripId, context = {}) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: INCLUDE });
  if (!trip) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, trip.organizationId, 'Trip not found');
  assertCanOperateTrip(requestingUser, trip);
  assertTransition(trip, 'resume');

  const updated = await prisma.trip.update({ where: { id: tripId }, data: { status: 'IN_PROGRESS' }, include: INCLUDE });
  await auditService.log(requestingUser.id, 'RESUME_TRIP', 'Trip', tripId, context);
  return updated;
};

// Ending a trip also nudges Vehicle.currentMileage forward if a higher
// odometer reading came in — keeps the vehicle's recorded mileage current
// without a separate manual update (§12's vehicle "Mileage" field).
const end = async (requestingUser, tripId, data, context = {}) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: INCLUDE });
  if (!trip) throw new AppError('Trip not found', 404);
  assertInScope(requestingUser, trip.organizationId, 'Trip not found');
  assertCanOperateTrip(requestingUser, trip);
  assertTransition(trip, 'end');

  if (data.endOdometer !== undefined && trip.startOdometer !== null && data.endOdometer < trip.startOdometer) {
    throw new AppError('endOdometer cannot be less than the trip\'s startOdometer', 400);
  }

  const distance =
    data.endOdometer !== undefined && trip.startOdometer !== null
      ? data.endOdometer - trip.startOdometer
      : trip.distance;

  const ops = [];
  if (data.endOdometer !== undefined) {
    ops.push(
      prisma.vehicle.update({
        where: { id: trip.vehicleId },
        data: { currentMileage: Math.max(trip.vehicle.currentMileage, data.endOdometer) },
      })
    );
  }
  ops.push(
    prisma.trip.update({
      where: { id: tripId },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
        endOdometer: data.endOdometer ?? trip.endOdometer,
        distance,
        ...(data.destLat !== undefined && { destLat: data.destLat }),
        ...(data.destLng !== undefined && { destLng: data.destLng }),
      },
      include: INCLUDE,
    })
  );

  const results = await prisma.$transaction(ops);
  const updated = results[results.length - 1];

  await auditService.log(requestingUser.id, 'END_TRIP', 'Trip', tripId, context, { distance });
  return updated;
};

module.exports = { list, listOwn, getOne, create, update, cancel, start, pause, resume, end };
