const { z } = require('zod');
const { ROLES } = require('../constants/roles');

const inviteUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z.string().trim().min(7).max(20).optional(),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Invalid role' }) }),
  // Only honored when the requester is SUPER_ADMIN — a FLEET_ADMIN/FLEET_MANAGER
  // can only invite into their own organization (enforced in userService).
  organizationId: z.string().trim().min(1).optional(),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    profileImage: z.string().trim().url().optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    profileImage: z.string().trim().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // Only honored for SUPER_ADMIN (enforced in userService) — every other
  // role is always scoped to their own organization.
  organizationId: z.string().trim().optional(),
});

module.exports = { inviteUserSchema, updateUserSchema, updateProfileSchema, listUsersQuerySchema };
