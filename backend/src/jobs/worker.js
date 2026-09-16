const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const logger = require('../utils/logger');
const { throttled } = require('../utils/throttledLogger');
const { JOB_NAMES } = require('./queue');
const alertGenerationService = require('../services/alertGenerationService');

const handlers = {
  [JOB_NAMES.DAILY_CHECKS]: alertGenerationService.runDailyChecks,
  [JOB_NAMES.OFFLINE_CHECK]: alertGenerationService.runOfflineCheck,
};

const createWorker = () => {
  const worker = new Worker(
    'alerts',
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) {
        logger.error('No handler registered for job', { jobName: job.name });
        return;
      }
      return handler();
    },
    { connection: createRedisConnection() }
  );

  // Throttled — same reasoning as queue.js's error handler.
  const logWorkerError = throttled();
  worker.on('error', (err) => logWorkerError('BullMQ worker error', { message: err.message }));
  worker.on('failed', (job, err) => logger.error('Alert job failed', { jobName: job?.name, message: err.message }));
  worker.on('completed', (job) => logger.debug('Alert job completed', { jobName: job.name }));

  return worker;
};

module.exports = { createWorker };
