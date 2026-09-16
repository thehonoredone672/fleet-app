const { z } = require('zod');
const { NOTIFICATION_TYPES } = require('../constants/notificationEnums');

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isRead: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

const pushTokenSchema = z.object({
  pushToken: z.string().trim().min(1, 'pushToken is required'),
});

module.exports = { listNotificationsQuerySchema, pushTokenSchema };
