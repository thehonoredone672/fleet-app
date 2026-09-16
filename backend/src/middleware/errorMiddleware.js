const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const env = require('../config/env');

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
};

// Centralized error handler — every thrown/rejected error in the app ends
// up here via asyncHandler or Express's default error propagation. Never
// leaks stack traces, DB errors, or other internals to the client.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : 'Internal server error';
  const errors = isAppError ? err.errors : [];

  if (!isAppError) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.originalUrl });
  } else if (statusCode >= 500) {
    logger.error(err.message, { path: req.originalUrl });
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(env.isProduction ? {} : { stack: isAppError ? undefined : err.stack }),
  });
};

module.exports = { notFoundHandler, errorHandler };
