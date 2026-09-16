const IORedis = require('ioredis');
const env = require('../config/env');
const logger = require('../utils/logger');

// A *factory*, not a shared singleton — BullMQ recommends giving each
// Queue/Worker/QueueEvents its own connection rather than sharing one.
// Sharing was tried first and caused a real bug: when Redis was
// unreachable, a rejection from one component's connection lifecycle
// wasn't caught by the other component's listeners, producing an
// unhandled promise rejection that crashed the whole process (via the
// unhandledRejection handler in server.js) — not just the background
// jobs. Verified by an actual boot-without-Redis smoke test.
//
// `maxRetriesPerRequest: null` is required by BullMQ (it manages its own
// blocking-command retry behavior). ioredis's default retryStrategy
// backs off and keeps trying indefinitely rather than throwing, so this
// never blocks process startup even if Redis is unreachable.
const createRedisConnection = () => {
  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

  let loggedUnreachable = false;
  connection.on('error', (err) => {
    if (!loggedUnreachable) {
      logger.error('Redis connection error — background jobs will retry once Redis is reachable', {
        message: err.message,
      });
      loggedUnreachable = true;
    }
  });
  connection.on('connect', () => {
    loggedUnreachable = false;
    logger.info('Redis connected');
  });

  return connection;
};

module.exports = { createRedisConnection };
