const { z } = require('zod');
const { VEHICLE_TYPES, FUEL_TYPES, VEHICLE_STATUSES } = require('../constants/vehicleEnums');

const currentYear = new Date().getFullYear();

const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(2).max(20).toUpperCase(),
  vehicleType: z.enum(VEHICLE_TYPES, { errorMap: () => ({ message: 'Invalid vehicle type' }) }),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1980).max(currentYear + 1),
  color: z.string().trim().min(1).optional(),
  fuelType: z.enum(FUEL_TYPES, { errorMap: () => ({ message: 'Invalid fuel type' }) }),
  capacity: z.coerce.number().int().positive().optional(),
  currentMileage: z.coerce.number().min(0).optional(),
  purchaseDate: z.coerce.date().optional(),
  insuranceExpiry: z.coerce.date().optional(),
  registrationExpiry: z.coerce.date().optional(),
  pollutionExpiry: z.coerce.date().optional(),
  // Only honored when the requester is SUPER_ADMIN (see userValidators for
  // the same pattern) — everyone else is confined to their own org.
  organizationId: z.string().trim().min(1).optional(),
});

const updateVehicleSchema = z
  .object({
    registrationNumber: z.string().trim().min(2).max(20).toUpperCase().optional(),
    vehicleType: z.enum(VEHICLE_TYPES).optional(),
    make: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    year: z.coerce.number().int().min(1980).max(currentYear + 1).optional(),
    color: z.string().trim().min(1).optional(),
    fuelType: z.enum(FUEL_TYPES).optional(),
    capacity: z.coerce.number().int().positive().optional(),
    currentMileage: z.coerce.number().min(0).optional(),
    status: z.enum(VEHICLE_STATUSES).optional(),
    purchaseDate: z.coerce.date().optional(),
    insuranceExpiry: z.coerce.date().optional(),
    registrationExpiry: z.coerce.date().optional(),
    pollutionExpiry: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listVehiclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = { createVehicleSchema, updateVehicleSchema, listVehiclesQuerySchema };
