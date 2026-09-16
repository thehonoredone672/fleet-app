const { z } = require('zod');

const createAssignmentSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId is required'),
  driverId: z.string().trim().min(1, 'driverId is required'),
});

const listAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vehicleId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // Only honored for SUPER_ADMIN — everyone else is scoped to their org.
  organizationId: z.string().trim().optional(),
});

module.exports = { createAssignmentSchema, listAssignmentsQuerySchema };
