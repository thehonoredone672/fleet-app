const { z } = require('zod');
const { ALERT_TYPES, ALERT_SEVERITIES } = require('../constants/alertEnums');

const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(ALERT_TYPES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  isResolved: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  vehicleId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = { listAlertsQuerySchema };
