const { z } = require('zod');

const createGeofenceSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().positive('radiusMeters must be greater than 0'),
  notifyOnEvent: z.boolean().optional(),
  // Only honored for SUPER_ADMIN — same pattern as the other validators.
  organizationId: z.string().trim().optional(),
});

const updateGeofenceSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().positive().optional(),
    notifyOnEvent: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listGeofencesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  organizationId: z.string().trim().optional(),
});

module.exports = { createGeofenceSchema, updateGeofenceSchema, listGeofencesQuerySchema };
