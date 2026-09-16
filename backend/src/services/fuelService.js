const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { can } = require('../constants/permissions');
const { requireActiveAssignmentForDriver } = require('./assignmentService');
const auditService = require('./auditService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

// §15 heuristic: "Large fuel quantity + small odometer difference ->
// Possible abnormal fuel usage." These thresholds are illustrative
// defaults, not tuned per vehicle/fleet — a real implementation would
// likely make them configurable per organization or vehicle class in a
// later phase; kept as named constants here rather than magic numbers so
// that future tuning is a one-line change.
const ABNORMAL_MIN_QUANTITY_LITERS = 20;
const ABNORMAL_MAX_ODOMETER_DELTA_KM = 50;

const round2 = (n) => Math.round(n * 100) / 100;

// Flags a fuel record as suspicious if it's a large fill with almost no
// distance covered since the driver's previous fill on the same vehicle.
// Returns null if there's no prior record to compare against (not enough
// history to judge "small odometer difference").
const detectAnomaly = async (vehicleId, odometer, quantity) => {
  if (quantity < ABNORMAL_MIN_QUANTITY_LITERS) return null;

  const previous = await prisma.fuelRecord.findFirst({
    where: { vehicleId },
    orderBy: { odometer: 'desc' },
  });
  if (!previous) return null;

  const odometerDelta = odometer - previous.odometer;
  if (odometerDelta >= 0 && odometerDelta < ABNORMAL_MAX_ODOMETER_DELTA_KM) {
    return `Possible abnormal fuel usage: ${quantity}L added after only ${odometerDelta}km since the last fill-up`;
  }
  return null;
};

// Driver-submitted fuel record — ownership-gated (their own actively
// assigned vehicle, cross-checked, never trusted from the payload) same
// as location ingestion. Flags and records a FUEL_ANOMALY alert when the
// heuristic above trips; the Alert *management* API (list/resolve) lands
// in Phase 15, but the detection itself doesn't need to wait for that —
// rows are simply queryable once that API exists.
//
// Accepts an optional client-generated `clientId` for the mobile offline
// sync queue (§19, Phase 19): if the driver's device retries a
// submission after losing the response to a dropped connection, the
// retry is detected and the original record returned instead of
// creating a duplicate — same dedup pattern as Location.clientId.
const create = async (requestingUser, data, context = {}) => {
  const { driver, assignment } = await requireActiveAssignmentForDriver(requestingUser);

  if (data.vehicleId !== assignment.vehicleId) {
    throw new AppError('vehicleId does not match your currently assigned vehicle', 403);
  }

  if (data.clientId) {
    const existing = await prisma.fuelRecord.findUnique({ where: { clientId: data.clientId } });
    if (existing) {
      // Replay of an already-processed submission — anomaly detection
      // and any resulting alert already ran on the original attempt.
      return { ...existing, flagged: false, replayed: true };
    }
  }

  const totalCost = data.totalCost ?? round2(data.quantity * data.pricePerLiter);
  const anomalyMessage = await detectAnomaly(data.vehicleId, data.odometer, data.quantity);

  let record;
  try {
    record = await prisma.fuelRecord.create({
      data: {
        vehicleId: data.vehicleId,
        driverId: driver.id,
        fuelType: data.fuelType,
        quantity: data.quantity,
        pricePerLiter: data.pricePerLiter,
        totalCost,
        odometer: data.odometer,
        station: data.station,
        receiptUrl: data.receiptUrl,
        date: data.date || new Date(),
        clientId: data.clientId || null,
      },
    });
  } catch (err) {
    // Two concurrent retries racing past the findUnique check above —
    // the loser hits the unique constraint instead of the pre-check.
    if (err.code === 'P2002' && data.clientId) {
      const existing = await prisma.fuelRecord.findUnique({ where: { clientId: data.clientId } });
      if (existing) return { ...existing, flagged: false, replayed: true };
    }
    throw err;
  }

  if (anomalyMessage) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    await prisma.alert.create({
      data: {
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        type: 'FUEL_ANOMALY',
        severity: 'MEDIUM',
        message: anomalyMessage,
      },
    });
    await notificationService
      .notifyOrgManagers(vehicle.organizationId, { title: 'Fuel anomaly detected', message: anomalyMessage, type: 'ALERT' })
      .catch((err) => logger.error('Failed to notify managers of fuel anomaly', { message: err.message }));
  }

  await auditService.log(requestingUser.id, 'CREATE_FUEL_RECORD', 'FuelRecord', record.id, context, {
    vehicleId: data.vehicleId,
    flagged: Boolean(anomalyMessage),
  });

  return { ...record, flagged: Boolean(anomalyMessage) };
};

// A driver may list/read only their own submitted records (e.g. the
// mobile Driver Home "today's fuel" summary) — an ownership view, not
// the `fuel:read` matrix grant they don't have (which governs the
// admin-side browse/correct view across the whole org). Same
// ownership-vs-matrix split already used by documentService.
const list = async (requestingUser, query) => {
  const { page, limit, vehicleId, dateFrom, dateTo, organizationId } = query;

  let where;
  if (requestingUser.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: requestingUser.id } });
    if (!driver) throw new AppError('Driver profile not found', 404);
    where = { driverId: driver.id };
  } else {
    if (!can(requestingUser.role, 'fuel', 'read')) {
      throw new AppError('You do not have permission to perform this action', 403);
    }
    const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;
    where = {
      ...(scopeOrgId && { vehicle: { organizationId: scopeOrgId } }),
      ...(query.driverId && { driverId: query.driverId }),
    };
  }
  if (vehicleId) where.vehicleId = vehicleId;
  if (dateFrom || dateTo) where.date = { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) };

  const [items, total] = await Promise.all([
    prisma.fuelRecord.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { date: 'desc' },
      include: { vehicle: true },
    }),
    prisma.fuelRecord.count({ where }),
  ]);

  return { fuelRecords: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const getOne = async (requestingUser, fuelRecordId) => {
  const record = await prisma.fuelRecord.findUnique({ where: { id: fuelRecordId }, include: { vehicle: true } });
  if (!record) throw new AppError('Fuel record not found', 404);

  if (requestingUser.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: requestingUser.id } });
    if (!driver || record.driverId !== driver.id) throw new AppError('Fuel record not found', 404);
    return record;
  }

  if (!can(requestingUser.role, 'fuel', 'read')) {
    throw new AppError('You do not have permission to perform this action', 403);
  }
  assertInScope(requestingUser, record.vehicle.organizationId, 'Fuel record not found');
  return record;
};

const update = async (requestingUser, fuelRecordId, data, context = {}) => {
  const existing = await prisma.fuelRecord.findUnique({ where: { id: fuelRecordId }, include: { vehicle: true } });
  if (!existing) throw new AppError('Fuel record not found', 404);
  assertInScope(requestingUser, existing.vehicle.organizationId, 'Fuel record not found');

  const updated = await prisma.fuelRecord.update({
    where: { id: fuelRecordId },
    data,
    include: { vehicle: true },
  });

  await auditService.log(requestingUser.id, 'UPDATE_FUEL_RECORD', 'FuelRecord', fuelRecordId, context, data);
  return updated;
};

// §15: fuel efficiency (distance / fuel consumed) and cost per km
// (fuel cost / distance), scoped to a vehicle, a driver, or the whole
// organization over a date range — covers "daily/monthly fuel cost",
// "vehicle fuel efficiency", and "driver fuel usage" with one query
// shape rather than three separate endpoints.
const getSummary = async (requestingUser, query) => {
  const { vehicleId, driverId, dateFrom, dateTo, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const dateRange = (dateFrom || dateTo) && { gte: dateFrom, lte: dateTo };

  const fuelWhere = {
    ...(scopeOrgId && { vehicle: { organizationId: scopeOrgId } }),
    ...(vehicleId && { vehicleId }),
    ...(driverId && { driverId }),
    ...(dateRange && { date: dateRange }),
  };

  const tripWhere = {
    status: 'COMPLETED',
    ...(scopeOrgId && { organizationId: scopeOrgId }),
    ...(vehicleId && { vehicleId }),
    ...(driverId && { driverId }),
    ...(dateRange && { endTime: dateRange }),
  };

  const [fuelAgg, tripAgg, recordCount] = await Promise.all([
    prisma.fuelRecord.aggregate({ where: fuelWhere, _sum: { quantity: true, totalCost: true } }),
    prisma.trip.aggregate({ where: tripWhere, _sum: { distance: true } }),
    prisma.fuelRecord.count({ where: fuelWhere }),
  ]);

  const totalQuantity = fuelAgg._sum.quantity || 0;
  const totalCost = fuelAgg._sum.totalCost || 0;
  const totalDistance = tripAgg._sum.distance || 0;

  return {
    vehicleId: vehicleId || null,
    driverId: driverId || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    recordCount,
    totalQuantity,
    totalCost: round2(totalCost),
    totalDistance,
    efficiencyKmPerLiter: totalQuantity > 0 && totalDistance > 0 ? round2(totalDistance / totalQuantity) : null,
    costPerKm: totalDistance > 0 ? round2(totalCost / totalDistance) : null,
  };
};

module.exports = { create, list, getOne, update, getSummary };
