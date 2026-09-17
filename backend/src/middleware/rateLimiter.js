const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// The automated test suite runs dozens of test files against one
// long-lived Express app instance in a single process, sharing one
// in-memory rate-limit store — hundreds of requests within seconds, all
// from the same loopback "IP" as far as express-rate-limit is concerned.
// That's indistinguishable from the abuse pattern these limiters exist
// to catch, so without this they fire mid-suite and fail unrelated
// tests with a generic 429 (confirmed live via CI: this is exactly what
// happened the first time the full integration suite ran for real).
// Production behavior is unaffected — this only skips enforcement when
// NODE_ENV=test.
const skipInTest = () => env.nodeEnv === 'test';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many requests, please try again later', errors: [] },
});

// Tighter limit on auth endpoints specifically — login/register/password
// reset are the routes most worth protecting from brute force/enumeration.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many attempts, please try again later', errors: [] },
});

module.exports = { generalLimiter, authLimiter };
