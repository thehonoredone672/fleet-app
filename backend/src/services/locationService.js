const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { getIO } = require('../sockets/ioInstance');
const { orgFleetRoom } = require('../sockets/rooms');
const { requireActiveAssignmentForDriver } = require('./assignmentService');
const geofenceService = require('./geofenceService');
const logger = require('../utils/logger');

// Ingests one or more GPS points from the authenticated driver's device.
// The vehicleId on every point is cross-checked against the driver's
// actual active assignment — never trusted from the payload alone — and
// any point that doesn't match is rejected (the whole call fails, rather
// than silently dropping mismatched points, so a client bug is visible
// instead of silently losing data).
const ingest = async (requestingUser, rawPoints) => {
  const points = Array.isArray(rawPoints) ? rawPoints : [rawPoints];
  const { driver, assignment } = await requireActiveAssignmentForDriver(requestingUser);

  const mismatched = points.find((p) => p.vehicleId !== assignment.vehicleId);
  if (mismatched) {
    throw new AppError('vehicleId does not match your currently assigned vehicle', 403);
  }

  const rows = points.map((p) => ({
    vehicleId: p.vehicleId,
    driverId: driver.id,
    tripId: p.tripId || null,
    clientId: p.clientId || null,
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed ?? null,
    heading: p.heading ?? null,
    accuracy: p.accuracy ?? null,
    timestamp: p.timestamp,
  }));

  // createMany + skipDuplicates relies on the unique constraint on
  // `clientId` to silently drop points already stored (a retried/replayed
  // offline-sync batch) — far cheaper than an upsert-per-point loop for a
  // batch that can be up to 100 points. Points without a clientId (null)
  // are never treated as duplicates of each other, per Postgres unique
  // index semantics.
  const result = await prisma.location.createMany({ data: rows, skipDuplicates: true });

  const latest = rows.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
  broadcastLocation(requestingUser.organizationId, latest);

  // Checked in chronological order so entry/exit transitions come out
  // correct even for a batch of offline-queued points — a side effect of
  // ingestion, never a reason for it to fail (a geofence bug shouldn't
  // block a driver's GPS from being recorded).
  const chronological = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  for (const point of chronological) {
    try {
      await geofenceService.checkGeofenceTransitions({
        organizationId: requestingUser.organizationId,
        vehicleId: point.vehicleId,
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: point.timestamp,
      });
    } catch (err) {
      logger.error('Geofence check failed', { message: err.message });
    }
  }

  return { accepted: result.count, latest };
};

const broadcastLocation = (organizationId, point) => {
  const io = getIO();
  if (!io) return; // no-op outside a running server (e.g. unit tests)
  io.to(orgFleetRoom(organizationId)).emit('vehicle:location', point);
};

const getLatestForVehicle = async (requestingUser, vehicleId) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');

  const location = await prisma.location.findFirst({
    where: { vehicleId },
    orderBy: { timestamp: 'desc' },
  });
  if (!location) throw new AppError('No location has been recorded for this vehicle yet', 404);

  return location;
};

module.exports = { ingest, getLatestForVehicle };
