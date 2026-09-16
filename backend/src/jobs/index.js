const { createWorker } = require('./worker');
const { registerSchedules } = require('./scheduler');
const logger = require('../utils/logger');

const SCHEDULE_TIMEOUT_MS = 5000;

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

// Called once at server startup (server.js), never awaited there — if
// Redis is unreachable, ioredis/BullMQ retry indefinitely in the
// background rather than throwing (see config/redis.js), so this
// function could otherwise hang forever. The timeout here just bounds
// how long we wait before logging "jobs unavailable for now" instead of
// leaving a silent dangling promise; the underlying connection keeps
// retrying regardless, and jobs start working the moment Redis becomes
// reachable, no restart needed.
const initJobs = async () => {
  const worker = createWorker();

  try {
    await withTimeout(registerSchedules(), SCHEDULE_TIMEOUT_MS, 'Registering alert job schedules');
  } catch (err) {
    logger.error('Could not register alert job schedules yet — will keep retrying via the Redis connection', {
      message: err.message,
    });
  }

  return worker;
};

module.exports = { initJobs };
