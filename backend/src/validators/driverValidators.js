const { z } = require('zod');
const { DRIVER_STATUSES } = require('../constants/driverEnums');

// Creates the underlying User (role DRIVER) and the Driver profile
// together — see docs/api.md#drivers for why this is a single onboarding
// call rather than a two-step "invite user, then attach profile" flow.
const createDriverSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z.string().trim().min(7).max(20).optional(),
  licenseNumber: z.string().trim().min(1, 'License number is required'),
  licenseType: z.string().trim().min(1, 'License type is required'),
  licenseExpiry: z.coerce.date({ errorMap: () => ({ message: 'Invalid license expiry date' }) }),
  emergencyContact: z.string().trim().min(1).optional(),
  joiningDate: z.coerce.date().optional(),
  // Only honored when the requester is SUPER_ADMIN — same pattern as
  // userValidators/vehicleValidators.
  organizationId: z.string().trim().min(1).optional(),
});

const updateDriverSchema = z
  .object({
    licenseNumber: z.string().trim().min(1).optional(),
    licenseType: z.string().trim().min(1).optional(),
    licenseExpiry: z.coerce.date().optional(),
    emergencyContact: z.string().trim().min(1).optional(),
    joiningDate: z.coerce.date().optional(),
    status: z.enum(DRIVER_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

// A driver may update their own emergency contact only — license fields
// are admin-controlled so a driver can't self-edit their way around an
// expiry check (see docs/security.md#rbac).
const updateOwnDriverProfileSchema = z.object({
  emergencyContact: z.string().trim().min(1, 'emergencyContact is required'),
});

const listDriversQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(DRIVER_STATUSES).optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = {
  createDriverSchema,
  updateDriverSchema,
  updateOwnDriverProfileSchema,
  listDriversQuerySchema,
};
