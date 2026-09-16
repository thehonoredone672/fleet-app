const prisma = require('../config/database');
const { resolveDateRange } = require('../utils/dateRange');
const fuelService = require('./fuelService');

const round2 = (n) => Math.round(n * 100) / 100;
const MS_PER_HOUR = 60 * 60 * 1000;

// §20/§49 of the product spec. If a SUPER_ADMIN doesn't pass
// `organizationId`, this aggregates across every organization — same
// "no filter = everything" convention every other list/report endpoint
// in this app already follows for that role.
const getKpis = async (requestingUser, query) => {
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? query.organizationId : requestingUser.organizationId;
  const { from, to } = resolveDateRange(query);

  const orgWhere = scopeOrgId ? { organizationId: scopeOrgId } : {};
  const vehicleOrgWhere = scopeOrgId ? { vehicle: { organizationId: scopeOrgId } } : {};

  const [
    totalVehicles,
    activeVehicles,
    maintenanceVehicles,
    totalDrivers,
    activeDrivers,
    activeTrips,
    completedTrips,
    unresolvedAlerts,
    vehiclesOnActiveTrip,
    completedTripDurations,
    distanceAgg,
    maintenanceCostAgg,
    fuelSummary,
  ] = await Promise.all([
    prisma.vehicle.count({ where: { ...orgWhere, status: { not: 'RETIRED' } } }),
    prisma.vehicle.count({ where: { ...orgWhere, status: 'ACTIVE' } }),
    prisma.vehicle.count({ where: { ...orgWhere, status: 'MAINTENANCE' } }),
    prisma.driver.count({ where: orgWhere }),
    prisma.driver.count({ where: { ...orgWhere, status: 'ACTIVE' } }),
    prisma.trip.count({ where: { ...orgWhere, status: { in: ['IN_PROGRESS', 'PAUSED'] } } }),
    prisma.trip.count({ where: { ...orgWhere, status: 'COMPLETED', endTime: { gte: from, lte: to } } }),
    prisma.alert.count({ where: { ...orgWhere, isResolved: false } }),
    prisma.trip.findMany({
      where: { ...orgWhere, status: { in: ['IN_PROGRESS', 'PAUSED'] } },
      select: { vehicleId: true },
      distinct: ['vehicleId'],
    }),
    prisma.trip.findMany({
      where: { ...orgWhere, status: 'COMPLETED', startTime: { not: null }, endTime: { gte: from, lte: to } },
      select: { startTime: true, endTime: true },
    }),
    prisma.trip.aggregate({
      where: { ...orgWhere, status: 'COMPLETED', endTime: { gte: from, lte: to } },
      _sum: { distance: true },
    }),
    // Maintenance has no direct organizationId — scoped via the vehicle
    // relation, same pattern as maintenanceService. `updatedAt` is used
    // as an approximation of "when the job completed" since the schema
    // has no dedicated completedAt timestamp.
    prisma.maintenance.aggregate({
      where: { ...vehicleOrgWhere, status: 'COMPLETED', updatedAt: { gte: from, lte: to } },
      _sum: { cost: true },
    }),
    fuelService.getSummary(requestingUser, { organizationId: scopeOrgId, dateFrom: from, dateTo: to }),
  ]);

  const availableVehicles = Math.max(0, activeVehicles - vehiclesOnActiveTrip.length);

  const activeVehicleHours = completedTripDurations.reduce(
    (sum, t) => sum + (t.endTime.getTime() - t.startTime.getTime()) / MS_PER_HOUR,
    0
  );
  const periodHours = Math.max(1, (to.getTime() - from.getTime()) / MS_PER_HOUR);
  const availableVehicleHours = activeVehicles * periodHours;
  const fleetUtilizationPercent =
    availableVehicleHours > 0 ? round2((activeVehicleHours / availableVehicleHours) * 100) : 0;

  return {
    period: { from, to },
    fleet: {
      totalVehicles,
      activeVehicles,
      maintenanceVehicles,
      availableVehicles,
    },
    drivers: { totalDrivers, activeDrivers },
    trips: { activeTrips, completedTrips },
    alerts: { unresolved: unresolvedAlerts },
    costs: {
      fuelCost: fuelSummary.totalCost,
      maintenanceCost: round2(maintenanceCostAgg._sum.cost || 0),
    },
    distance: { totalKm: distanceAgg._sum.distance || 0 },
    fleetUtilizationPercent,
    averageFuelEfficiencyKmPerLiter: fuelSummary.efficiencyKmPerLiter,
  };
};

module.exports = { getKpis };
