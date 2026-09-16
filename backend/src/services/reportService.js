const prisma = require('../config/database');
const { resolveDateRange } = require('../utils/dateRange');
const { USER_SUMMARY_SELECT } = require('../utils/prismaSelects');
const fuelService = require('./fuelService');

const round2 = (n) => Math.round(n * 100) / 100;
const MS_PER_HOUR = 60 * 60 * 1000;

const resolveScope = (requestingUser, organizationId) =>
  requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

// §21: "Fleet Utilization = Active vehicle hours / Available vehicle
// hours" (computed per-vehicle from completed-trip durations against the
// period length) and "Vehicle Downtime = Maintenance downtime / Total
// fleet time". The schema has no vehicle status-change history table, so
// there's no way to compute *time-integrated* historical downtime — a
// vehicle's current MAINTENANCE status is a snapshot, not a duration.
// `maintenanceDowntimePercent` below is therefore a documented
// approximation (share of the fleet currently under maintenance), not
// the spec's literal time-based ratio; a real implementation of that
// would need a VehicleStatusHistory table, which isn't in scope here.
const getFleetReport = async (requestingUser, query) => {
  const scopeOrgId = resolveScope(requestingUser, query.organizationId);
  const { from, to } = resolveDateRange(query);
  const orgWhere = scopeOrgId ? { organizationId: scopeOrgId } : {};

  const [vehicles, trips] = await Promise.all([
    prisma.vehicle.findMany({ where: { ...orgWhere, status: { not: 'RETIRED' } } }),
    prisma.trip.findMany({
      where: { ...orgWhere, status: 'COMPLETED', endTime: { gte: from, lte: to } },
      select: { vehicleId: true, startTime: true, endTime: true, distance: true },
    }),
  ]);

  const tripsByVehicle = new Map();
  for (const trip of trips) {
    if (!tripsByVehicle.has(trip.vehicleId)) tripsByVehicle.set(trip.vehicleId, []);
    tripsByVehicle.get(trip.vehicleId).push(trip);
  }

  const periodHours = Math.max(1, (to.getTime() - from.getTime()) / MS_PER_HOUR);

  const vehicleReports = vehicles.map((v) => {
    const vTrips = tripsByVehicle.get(v.id) || [];
    const activeHours = vTrips.reduce(
      (sum, t) => sum + (t.startTime && t.endTime ? (t.endTime.getTime() - t.startTime.getTime()) / MS_PER_HOUR : 0),
      0
    );
    const totalDistance = vTrips.reduce((sum, t) => sum + (t.distance || 0), 0);

    return {
      vehicleId: v.id,
      registrationNumber: v.registrationNumber,
      status: v.status,
      tripsCompleted: vTrips.length,
      activeHours: round2(activeHours),
      totalDistance,
      utilizationPercent: round2((activeHours / periodHours) * 100),
    };
  });

  const maintenanceVehicles = vehicles.filter((v) => v.status === 'MAINTENANCE').length;
  const averageUtilizationPercent = vehicleReports.length
    ? round2(vehicleReports.reduce((sum, v) => sum + v.utilizationPercent, 0) / vehicleReports.length)
    : 0;

  return {
    period: { from, to },
    summary: {
      totalVehicles: vehicles.length,
      maintenanceVehicles,
      maintenanceDowntimePercent: vehicles.length ? round2((maintenanceVehicles / vehicles.length) * 100) : 0,
      averageUtilizationPercent,
    },
    vehicles: vehicleReports,
  };
};

// §21/§15: org-wide fuel summary (reusing Phase 12's fuelService, which
// already implements the efficiency/cost-per-km formulas) plus a
// per-vehicle breakdown for comparing vehicles against each other.
const getFuelReport = async (requestingUser, query) => {
  const scopeOrgId = resolveScope(requestingUser, query.organizationId);
  const { from, to } = resolveDateRange(query);
  const orgWhere = scopeOrgId ? { organizationId: scopeOrgId } : {};

  const [summary, fuelByVehicle, distanceByVehicle, vehicles] = await Promise.all([
    fuelService.getSummary(requestingUser, { organizationId: scopeOrgId, dateFrom: from, dateTo: to }),
    prisma.fuelRecord.groupBy({
      by: ['vehicleId'],
      where: { ...(scopeOrgId && { vehicle: { organizationId: scopeOrgId } }), date: { gte: from, lte: to } },
      _sum: { quantity: true, totalCost: true },
    }),
    prisma.trip.groupBy({
      by: ['vehicleId'],
      where: { ...orgWhere, status: 'COMPLETED', endTime: { gte: from, lte: to } },
      _sum: { distance: true },
    }),
    prisma.vehicle.findMany({ where: orgWhere, select: { id: true, registrationNumber: true } }),
  ]);

  const registrationById = new Map(vehicles.map((v) => [v.id, v.registrationNumber]));
  const distanceById = new Map(distanceByVehicle.map((d) => [d.vehicleId, d._sum.distance || 0]));

  const byVehicle = fuelByVehicle.map((f) => {
    const totalQuantity = f._sum.quantity || 0;
    const totalCost = round2(f._sum.totalCost || 0);
    const totalDistance = distanceById.get(f.vehicleId) || 0;
    return {
      vehicleId: f.vehicleId,
      registrationNumber: registrationById.get(f.vehicleId) || null,
      totalQuantity,
      totalCost,
      totalDistance,
      efficiencyKmPerLiter: totalQuantity > 0 && totalDistance > 0 ? round2(totalDistance / totalQuantity) : null,
    };
  });

  return { period: { from, to }, summary, byVehicle };
};

const getMaintenanceReport = async (requestingUser, query) => {
  const scopeOrgId = resolveScope(requestingUser, query.organizationId);
  const { from, to } = resolveDateRange(query);
  const vehicleOrgWhere = scopeOrgId ? { vehicle: { organizationId: scopeOrgId } } : {};

  const [costAgg, byType, overdueCount, scheduledCount] = await Promise.all([
    prisma.maintenance.aggregate({
      where: { ...vehicleOrgWhere, status: 'COMPLETED', updatedAt: { gte: from, lte: to } },
      _sum: { cost: true },
      _count: true,
    }),
    prisma.maintenance.groupBy({
      by: ['type'],
      where: { ...vehicleOrgWhere, status: 'COMPLETED', updatedAt: { gte: from, lte: to } },
      _sum: { cost: true },
      _count: true,
    }),
    // "Overdue" is a current snapshot, not period-bound — a service that
    // was due last week is overdue today regardless of the report window.
    prisma.maintenance.count({
      where: { ...vehicleOrgWhere, status: 'SCHEDULED', nextServiceDate: { lt: new Date() } },
    }),
    prisma.maintenance.count({ where: { ...vehicleOrgWhere, status: 'SCHEDULED' } }),
  ]);

  return {
    period: { from, to },
    summary: {
      completedCount: costAgg._count,
      totalCost: round2(costAgg._sum.cost || 0),
      scheduledCount,
      overdueCount,
    },
    byType: byType.map((t) => ({ type: t.type, count: t._count, totalCost: round2(t._sum.cost || 0) })),
  };
};

// §21 Driver Performance: trips completed, average speed, fuel
// efficiency, late trips, reported incidents. `reportedIncidents` is
// `null` — IssueReport has no CRUD API yet (not part of this project's
// 21-phase roadmap so far), so there's no real data to report; returning
// null rather than a fabricated 0 makes the gap visible instead of
// silently implying "zero incidents."
const LATE_GRACE_MINUTES = 15;

const getDriverReport = async (requestingUser, query) => {
  const scopeOrgId = resolveScope(requestingUser, query.organizationId);
  const { from, to } = resolveDateRange(query);
  const orgWhere = scopeOrgId ? { organizationId: scopeOrgId } : {};

  const drivers = await prisma.driver.findMany({
    where: { ...orgWhere, ...(query.driverId && { id: query.driverId }) },
    include: { user: { select: USER_SUMMARY_SELECT } },
  });

  const reports = await Promise.all(
    drivers.map(async (driver) => {
      const [trips, speedAgg, fuelSummary] = await Promise.all([
        prisma.trip.findMany({
          where: { driverId: driver.id, status: 'COMPLETED', endTime: { gte: from, lte: to } },
          select: { scheduledAt: true, startTime: true },
        }),
        prisma.location.aggregate({
          where: { driverId: driver.id, timestamp: { gte: from, lte: to }, speed: { not: null } },
          _avg: { speed: true },
        }),
        fuelService.getSummary(requestingUser, { driverId: driver.id, dateFrom: from, dateTo: to, organizationId: scopeOrgId }),
      ]);

      const lateTrips = trips.filter(
        (t) => t.scheduledAt && t.startTime && t.startTime.getTime() - t.scheduledAt.getTime() > LATE_GRACE_MINUTES * 60 * 1000
      ).length;

      return {
        driverId: driver.id,
        name: driver.user.name,
        tripsCompleted: trips.length,
        lateTrips,
        averageSpeedKmh: speedAgg._avg.speed != null ? round2(speedAgg._avg.speed * 3.6) : null,
        fuelEfficiencyKmPerLiter: fuelSummary.efficiencyKmPerLiter,
        reportedIncidents: null,
      };
    })
  );

  return { period: { from, to }, drivers: reports };
};

module.exports = { getFleetReport, getFuelReport, getMaintenanceReport, getDriverReport };
