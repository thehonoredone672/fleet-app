const AppError = require('./AppError');

// Explicit allowed-transition table (§9/§48 of the product spec, and the
// architecture note in docs/architecture.md). A Trip always has its
// vehicle/driver set at creation (see constants/tripEnums.js), so the
// operational states are just SCHEDULED → IN_PROGRESS ⇄ PAUSED →
// COMPLETED, plus CANCELLED reachable from anywhere before COMPLETED.
// Pure and DB-free so it can be unit-tested directly.
const TRANSITIONS = {
  start: { from: ['SCHEDULED'], to: 'IN_PROGRESS' },
  pause: { from: ['IN_PROGRESS'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'IN_PROGRESS' },
  end: { from: ['IN_PROGRESS', 'PAUSED'], to: 'COMPLETED' },
  cancel: { from: ['SCHEDULED', 'IN_PROGRESS', 'PAUSED'], to: 'CANCELLED' },
};

// Throws if `action` isn't valid from the trip's current status; returns
// the resulting status otherwise.
const assertTransition = (trip, action) => {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(trip.status)) {
    throw new AppError(`Cannot ${action} a trip that is ${trip.status}`, 400);
  }
  return rule.to;
};

module.exports = { TRANSITIONS, assertTransition };
