// Mirrors the Prisma Trip-related enums.
//
// TripStatus includes ASSIGNED and STARTED for schema completeness (see
// the comment on TripStatus in schema.prisma), but the actual state
// machine implemented in tripService.js only ever transitions through
// SCHEDULED → IN_PROGRESS ⇄ PAUSED → COMPLETED, plus CANCELLED — a Trip
// always has its vehicle/driver set at creation (both fields are
// required), so a separate "ASSIGNED" state would be redundant with
// SCHEDULED, and "STARTED" collapses into IN_PROGRESS immediately.
const TRIP_STATUSES = ['SCHEDULED', 'ASSIGNED', 'STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const TRIP_PURPOSES = ['DELIVERY', 'PICKUP', 'PASSENGER_TRANSPORT', 'MAINTENANCE_RUN', 'OFFICIAL', 'OTHER'];

module.exports = { TRIP_STATUSES, TRIP_PURPOSES };
