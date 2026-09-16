const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

// The Live Map's cold-load snapshot (§11) — one row per vehicle, its most
// recent location. Written as a single DISTINCT ON query rather than one
// findFirst() per vehicle: an N+1 loop is fine for a demo fleet but not
// for the "10 -> 10,000 vehicles" scaling target in docs/architecture.md,
// so this is done the scalable way from the start.
const getLiveSnapshot = async (requestingUser, query = {}) => {
  const organizationId = requestingUser.role === 'SUPER_ADMIN' ? query.organizationId : requestingUser.organizationId;

  const vehicleWhere = {
    ...(organizationId && { organizationId }),
    status: { not: 'RETIRED' },
  };

  const vehicles = await prisma.vehicle.findMany({
    where: vehicleWhere,
    select: { id: true, registrationNumber: true, status: true },
  });

  if (vehicles.length === 0) return { vehicles: [] };

  const vehicleIds = vehicles.map((v) => v.id);
  const latestLocations = await prisma.$queryRaw`
    SELECT DISTINCT ON ("vehicleId") *
    FROM "locations"
    WHERE "vehicleId" IN (${Prisma.join(vehicleIds)})
    ORDER BY "vehicleId", "timestamp" DESC
  `;

  const locationByVehicleId = new Map(latestLocations.map((l) => [l.vehicleId, l]));

  return {
    vehicles: vehicles.map((v) => ({
      ...v,
      location: locationByVehicleId.get(v.id) || null,
    })),
  };
};

module.exports = { getLiveSnapshot };
