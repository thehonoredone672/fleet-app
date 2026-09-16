const { alertsQueue, JOB_NAMES } = require('./queue');
const { DAILY_CHECK_CRON, OFFLINE_CHECK_INTERVAL_MS } = require('../constants/alertConfig');
const logger = require('../utils/logger');

// BullMQ dedupes a repeatable job by its name + repeat options, so
// calling this on every server start (not just the first deploy) is
// safe — it upserts the schedule rather than creating duplicates.
const registerSchedules = async () => {
  await alertsQueue.add(JOB_NAMES.DAILY_CHECKS, {}, { repeat: { pattern: DAILY_CHECK_CRON }, removeOnComplete: 10, removeOnFail: 10 });
  await alertsQueue.add(
    JOB_NAMES.OFFLINE_CHECK,
    {},
    { repeat: { every: OFFLINE_CHECK_INTERVAL_MS }, removeOnComplete: 10, removeOnFail: 10 }
  );
  logger.info('Alert job schedules registered', {
    dailyChecks: DAILY_CHECK_CRON,
    offlineCheckMs: OFFLINE_CHECK_INTERVAL_MS,
  });
};

module.exports = { registerSchedules };
