const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { throttled } = require('../utils/throttledLogger');

// One queue for every alert-generation job — the volume here is tiny
// (a handful of scheduled runs a day, never user-request-driven), so
// there's no need for BullMQ's job-type isolation that separate queues
// would buy at higher volume.
const JOB_NAMES = {
  DAILY_CHECKS: 'alerts:daily-checks',
  OFFLINE_CHECK: 'alerts:offline-check',
};

const alertsQueue = new Queue('alerts', { connection: createRedisConnection() });
// Throttled — while Redis is unreachable this fires on every retry
// attempt (multiple times a second); the underlying connection's own
// error log (config/redis.js) already reports the root cause once.
const logQueueError = throttled();
alertsQueue.on('error', (err) => logQueueError('BullMQ queue error', { message: err.message }));

module.exports = { alertsQueue, JOB_NAMES };
