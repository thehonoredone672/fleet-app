const { z } = require('zod');
const { MAINTENANCE_TYPES, MAINTENANCE_STATUSES } = require('../constants/maintenanceEnums');

const createMaintenanceSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId is required'),
  type: z.enum(MAINTENANCE_TYPES, { errorMap: () => ({ message: 'Invalid maintenance type' }) }),
  description: z.string().trim().min(1, 'description is required'),
  serviceDate: z.coerce.date().optional(),
  nextServiceDate: z.coerce.date().optional(),
  nextServiceMileage: z.coerce.number().min(0).optional(),
  mileage: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateMaintenanceSchema = z
  .object({
    type: z.enum(MAINTENANCE_TYPES).optional(),
    description: z.string().trim().min(1).optional(),
    serviceDate: z.coerce.date().optional(),
    nextServiceDate: z.coerce.date().optional(),
    nextServiceMileage: z.coerce.number().min(0).optional(),
    mileage: z.coerce.number().min(0).optional(),
    cost: z.coerce.number().min(0).optional(),
    status: z.enum(MAINTENANCE_STATUSES).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listMaintenanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vehicleId: z.string().trim().optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  type: z.enum(MAINTENANCE_TYPES).optional(),
  // Upcoming-maintenance view: nextServiceDate <= this date.
  dueBefore: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = { createMaintenanceSchema, updateMaintenanceSchema, listMaintenanceQuerySchema };
