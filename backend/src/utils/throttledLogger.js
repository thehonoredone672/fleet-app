const logger = require('./logger');

// Wraps a logger call so repeated firings within `intervalMs` collapse to
// one log line — for error handlers on things that retry continuously
// (a BullMQ Queue/Worker reconnecting to an unreachable Redis fires
// 'error' on every failed attempt, which without this floods the log at
// several lines per second for as long as Redis stays down).
const throttled = (intervalMs = 30000) => {
  let lastLoggedAt = 0;
  return (message, meta) => {
    const now = Date.now();
    if (now - lastLoggedAt < intervalMs) return;
    lastLoggedAt = now;
    logger.error(message, meta);
  };
};

module.exports = { throttled };
