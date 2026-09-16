// Tunable thresholds for the background alert-generation jobs
// (src/services/alertGenerationService.js). Named constants rather than
// magic numbers scattered through the job logic — a real deployment
// would likely make some of these configurable per organization in a
// later phase.
module.exports = {
  // §14/§18: check anything expiring within this many days; severity
  // escalates further as it gets closer (see utils/alertSeverity.js).
  EXPIRY_WARNING_DAYS: 30,
  // §14: "Service due in 1,300 km" style mileage-based reminder.
  MAINTENANCE_MILEAGE_THRESHOLD_KM: 500,
  // A vehicle with an active (IN_PROGRESS/PAUSED) trip and no location
  // ping in this many minutes is flagged VEHICLE_OFFLINE.
  VEHICLE_OFFLINE_MINUTES: 30,
  // Daily at 08:00 — expiry and maintenance checks don't need to run
  // more often than that.
  DAILY_CHECK_CRON: '0 8 * * *',
  // Vehicle-offline detection needs to run much more frequently since
  // it's about near-real-time tracking health, not a slow-moving date.
  OFFLINE_CHECK_INTERVAL_MS: 5 * 60 * 1000,
};
