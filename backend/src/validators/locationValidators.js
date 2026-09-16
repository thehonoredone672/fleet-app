const { z } = require('zod');

// Deliberately has no `driverId` field — the submitting driver is always
// derived server-side from the authenticated user, never trusted from the
// payload (see docs/security.md#gps-tracking).
const locationPointSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId is required'),
  tripId: z.string().trim().min(1).optional(),
  // Client-generated UUID/identifier used to dedupe retried or
  // offline-synced points — see docs/gps-tracking.md.
  clientId: z.string().trim().min(1).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  speed: z.coerce.number().min(0).optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  accuracy: z.coerce.number().min(0).optional(),
  timestamp: z.coerce.date(),
});

// The REST endpoint accepts either a single point or a batch (used by the
// mobile app's offline sync queue on reconnect) — capped at 100 points per
// request so a misbehaving client can't submit an unbounded batch.
const ingestLocationSchema = z.union([locationPointSchema, z.array(locationPointSchema).min(1).max(100)]);

module.exports = { locationPointSchema, ingestLocationSchema };
