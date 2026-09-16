const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { initSockets } = require('./sockets');
const { initJobs } = require('./jobs');

const server = http.createServer(app);
initSockets(server);

// Not awaited — background jobs must never block the HTTP server from
// starting, and initJobs() already bounds/catches its own Redis-
// unreachable case (see jobs/index.js).
initJobs().catch((err) => logger.error('initJobs failed unexpectedly', { message: err.message }));

server.listen(env.port, () => {
  logger.info(`API listening on port ${env.port} (${env.nodeEnv})`);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', { message: err.message, stack: err.stack });
  server.close(() => process.exit(1));
});

module.exports = server;
