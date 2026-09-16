const prisma = require('../config/database');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const { severityForDaysUntil, severityForDistanceUntil } = require('../utils/alertSeverity');

// Not every Alert type has its own NotificationType — anything without a
// direct match (FUEL_ANOMALY, VEHICLE_OFFLINE, SPEEDING, ...) falls back
// to the generic ALERT notification type.
const ALERT_TO_NOTIFICATION_TYPE = {
  VEHICLE_MAINTENANCE: 'MAINTENANCE_DUE',
  DOCUMENT_EXPIRY: 'DOCUMENT_EXPIRY',
  LICENSE_EXPIRY: 'LICENSE_EXPIRY',
};
const {
  EXPIRY_WARNING_DAYS,
  MAINTENANCE_MILEAGE_THRESHOLD_KM,
  VEHICLE_OFFLINE_MINUTES,
} = require('../constants/alertConfig');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const daysUntil = (date) => Math.ceil((date.getTime() - Date.now()) / MS_PER_DAY);

// Finds the existing unresolved alert for this exact (type, subject) pair
// and refreshes its severity/message, or creates one — never duplicates.
// This is what turns "30/15/7/1 days before" into escalating urgency on
// one alert rather than four separate rows spamming the same warning.
const upsertSubjectAlert = async ({ organizationId, subject, type, severity, message }) => {
  const where = {
    type,
    isResolved: false,
    vehicleId: subject.vehicleId ?? null,
    driverId: subject.driverId ?? null,
  };

  const existing = await prisma.alert.findFirst({ where });
  if (existing) {
    if (existing.severity !== severity || existing.message !== message) {
      await prisma.alert.update({ where: { id: existing.id }, data: { severity, message } });
    }
    return { id: existing.id, created: false };
  }

  const created = await prisma.alert.create({
    data: { organizationId, type, severity, message, ...subject },
  });

  // Only on genuine creation, not every escalation update — otherwise a
  // deadline ticking from 30 -> 15 -> 7 -> 1 days would notify managers
  // four times about the same underlying thing.
  await notificationService
    .notifyOrgManagers(organizationId, {
      title: `New ${type.replace(/_/g, ' ').toLowerCase()} alert`,
      message,
      type: ALERT_TO_NOTIFICATION_TYPE[type] || 'ALERT',
    })
    .catch((err) => logger.error('Failed to notify managers of new alert', { message: err.message }));

  return { id: created.id, created: true };
};

const checkDocumentExpiries = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * MS_PER_DAY);

  const documents = await prisma.document.findMany({
    where: { expiryDate: { gte: now, lte: cutoff } },
    include: { vehicle: true, driver: true },
  });

  let processed = 0;
  for (const doc of documents) {
    const organizationId = doc.vehicle?.organizationId ?? doc.driver?.organizationId;
    if (!organizationId) continue;

    const days = daysUntil(doc.expiryDate);
    const subject = doc.vehicleId ? { vehicleId: doc.vehicleId } : { driverId: doc.driverId };
    const label = doc.documentNumber ? `${doc.type} (${doc.documentNumber})` : doc.type;

    await upsertSubjectAlert({
      organizationId,
      subject,
      type: 'DOCUMENT_EXPIRY',
      severity: severityForDaysUntil(days),
      message: `${label} expires in ${days} day(s)`,
    });
    processed += 1;
  }
  return processed;
};

const checkLicenseExpiries = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * MS_PER_DAY);

  const drivers = await prisma.driver.findMany({
    where: { licenseExpiry: { gte: now, lte: cutoff }, status: 'ACTIVE' },
  });

  let processed = 0;
  for (const driver of drivers) {
    const days = daysUntil(driver.licenseExpiry);
    await upsertSubjectAlert({
      organizationId: driver.organizationId,
      subject: { driverId: driver.id },
      type: 'LICENSE_EXPIRY',
      severity: severityForDaysUntil(days),
      message: `Driving license expires in ${days} day(s)`,
    });
    processed += 1;
  }
  return processed;
};

const checkMaintenanceDue = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * MS_PER_DAY);

  const [dateDue, mileageDue] = await Promise.all([
    prisma.maintenance.findMany({
      where: { status: 'SCHEDULED', nextServiceDate: { gte: now, lte: cutoff } },
      include: { vehicle: true },
    }),
    prisma.maintenance.findMany({
      where: { status: 'SCHEDULED', nextServiceMileage: { not: null } },
      include: { vehicle: true },
    }),
  ]);

  let processed = 0;

  for (const record of dateDue) {
    const days = daysUntil(record.nextServiceDate);
    await upsertSubjectAlert({
      organizationId: record.vehicle.organizationId,
      subject: { vehicleId: record.vehicleId },
      type: 'VEHICLE_MAINTENANCE',
      severity: severityForDaysUntil(days),
      message: `${record.type} service due in ${days} day(s)`,
    });
    processed += 1;
  }

  for (const record of mileageDue) {
    const kmLeft = record.nextServiceMileage - record.vehicle.currentMileage;
    if (kmLeft > MAINTENANCE_MILEAGE_THRESHOLD_KM) continue;

    await upsertSubjectAlert({
      organizationId: record.vehicle.organizationId,
      subject: { vehicleId: record.vehicleId },
      type: 'VEHICLE_MAINTENANCE',
      severity: severityForDistanceUntil(kmLeft),
      message: `${record.type} service due in ${kmLeft} km`,
    });
    processed += 1;
  }

  return processed;
};

// Unlike the expiry checks, this one can also *resolve* an alert — once
// a vehicle that was flagged offline starts reporting location again,
// there's no reason to make a manager manually clear it.
const checkVehicleOffline = async () => {
  const activeTrips = await prisma.trip.findMany({
    where: { status: { in: ['IN_PROGRESS', 'PAUSED'] } },
    include: { vehicle: true },
  });

  const cutoff = new Date(Date.now() - VEHICLE_OFFLINE_MINUTES * 60 * 1000);
  let processed = 0;

  for (const trip of activeTrips) {
    const lastLocation = await prisma.location.findFirst({
      where: { vehicleId: trip.vehicleId },
      orderBy: { timestamp: 'desc' },
    });
    const isOffline = !lastLocation || lastLocation.timestamp < cutoff;

    const existing = await prisma.alert.findFirst({
      where: { type: 'VEHICLE_OFFLINE', vehicleId: trip.vehicleId, isResolved: false },
    });

    if (isOffline && !existing) {
      const message = `No location update in over ${VEHICLE_OFFLINE_MINUTES} minutes during an active trip`;
      await prisma.alert.create({
        data: {
          organizationId: trip.vehicle.organizationId,
          vehicleId: trip.vehicleId,
          type: 'VEHICLE_OFFLINE',
          severity: 'HIGH',
          message,
        },
      });
      await notificationService
        .notifyOrgManagers(trip.vehicle.organizationId, { title: 'Vehicle offline', message, type: 'ALERT' })
        .catch((err) => logger.error('Failed to notify managers of vehicle-offline alert', { message: err.message }));
      processed += 1;
    } else if (!isOffline && existing) {
      await prisma.alert.update({ where: { id: existing.id }, data: { isResolved: true, resolvedAt: new Date() } });
      processed += 1;
    }
  }

  return processed;
};

const runDailyChecks = async () => {
  const [documents, licenses, maintenance] = await Promise.all([
    checkDocumentExpiries(),
    checkLicenseExpiries(),
    checkMaintenanceDue(),
  ]);
  const summary = { documents, licenses, maintenance };
  logger.info('Daily alert checks complete', summary);
  return summary;
};

const runOfflineCheck = async () => {
  const vehicles = await checkVehicleOffline();
  logger.info('Vehicle-offline check complete', { vehicles });
  return { vehicles };
};

module.exports = {
  checkDocumentExpiries,
  checkLicenseExpiries,
  checkMaintenanceDue,
  checkVehicleOffline,
  runDailyChecks,
  runOfflineCheck,
};
