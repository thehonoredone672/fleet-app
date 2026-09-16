// Base class for operational (expected) errors — invalid input, not found,
// unauthorized, conflicting state, etc. errorMiddleware treats anything
// that isn't an AppError as an unexpected 500 and hides its details from
// the client.
class AppError extends Error {
  constructor(message, statusCode = 400, errors = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
