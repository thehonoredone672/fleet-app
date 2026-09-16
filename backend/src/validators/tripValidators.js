const { z } = require('zod');
const { TRIP_PURPOSES, TRIP_STATUSES } = require('../constants/tripEnums');

const createTripSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId is required'),
  driverId: z.string().trim().min(1, 'driverId is required'),
  source: z.string().trim().min(1, 'source is required'),
  sourceLat: z.coerce.number().min(-90).max(90).optional(),
  sourceLng: z.coerce.number().min(-180).max(180).optional(),
  destination: z.string().trim().min(1, 'destination is required'),
  destLat: z.coerce.number().min(-90).max(90).optional(),
  destLng: z.coerce.number().min(-180).max(180).optional(),
  scheduledAt: z.coerce.date().optional(),
  purpose: z.enum(TRIP_PURPOSES).optional(),
  notes: z.string().trim().max(2000).optional(),
  // Only honored for SUPER_ADMIN — same pattern as the other validators.
  organizationId: z.string().trim().optional(),
});

// Only allowed while the trip is still SCHEDULED (enforced in
// tripService) — a trip's route/schedule shouldn't be edited mid-flight;
// cancel and recreate instead.
const updateTripSchema = z
  .object({
    source: z.string().trim().min(1).optional(),
    sourceLat: z.coerce.number().min(-90).max(90).optional(),
    sourceLng: z.coerce.number().min(-180).max(180).optional(),
    destination: z.string().trim().min(1).optional(),
    destLat: z.coerce.number().min(-90).max(90).optional(),
    destLng: z.coerce.number().min(-180).max(180).optional(),
    scheduledAt: z.coerce.date().optional(),
    purpose: z.enum(TRIP_PURPOSES).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

// Live GPS capture on start/end is wired up in Phase 9 — for now these
// accept an optional odometer reading and an optional GPS-corrected
// coordinate (the driver's actual position may differ slightly from the
// trip's pre-set source/destination).
const startTripSchema = z.object({
  startOdometer: z.coerce.number().min(0).optional(),
  sourceLat: z.coerce.number().min(-90).max(90).optional(),
  sourceLng: z.coerce.number().min(-180).max(180).optional(),
});

const endTripSchema = z.object({
  endOdometer: z.coerce.number().min(0).optional(),
  destLat: z.coerce.number().min(-90).max(90).optional(),
  destLng: z.coerce.number().min(-180).max(180).optional(),
});

const listTripsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TRIP_STATUSES).optional(),
  driverId: z.string().trim().optional(),
  vehicleId: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

const listOwnTripsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TRIP_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

module.exports = {
  createTripSchema,
  updateTripSchema,
  startTripSchema,
  endTripSchema,
  listTripsQuerySchema,
  listOwnTripsQuerySchema,
};
