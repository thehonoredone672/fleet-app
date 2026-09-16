const { z } = require('zod');
const { FUEL_TYPES } = require('../constants/vehicleEnums');

// Deliberately no `driverId` — always derived from the authenticated
// driver, never trusted from the payload, same rule as location ingestion
// (docs/gps-tracking.md#authorization-model). `vehicleId` is still
// required so it can be cross-checked against the driver's active
// assignment rather than silently assumed.
const createFuelRecordSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId is required'),
  fuelType: z.enum(FUEL_TYPES, { errorMap: () => ({ message: 'Invalid fuel type' }) }),
  quantity: z.coerce.number().positive('quantity must be greater than 0'),
  pricePerLiter: z.coerce.number().positive('pricePerLiter must be greater than 0'),
  totalCost: z.coerce.number().positive().optional(),
  odometer: z.coerce.number().min(0),
  station: z.string().trim().max(200).optional(),
  receiptUrl: z.string().trim().url().optional(),
  date: z.coerce.date().optional(),
  // Offline-queue dedup key (§19) — see docs/architecture.md#offline-sync.
  clientId: z.string().trim().min(1).optional(),
});

const updateFuelRecordSchema = z
  .object({
    fuelType: z.enum(FUEL_TYPES).optional(),
    quantity: z.coerce.number().positive().optional(),
    pricePerLiter: z.coerce.number().positive().optional(),
    totalCost: z.coerce.number().positive().optional(),
    odometer: z.coerce.number().min(0).optional(),
    station: z.string().trim().max(200).optional(),
    receiptUrl: z.string().trim().url().optional(),
    date: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listFuelQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vehicleId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

// Same filter shape as the list query, minus pagination — backs the
// aggregate efficiency/cost view (§15).
const fuelSummaryQuerySchema = z.object({
  vehicleId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = { createFuelRecordSchema, updateFuelRecordSchema, listFuelQuerySchema, fuelSummaryQuerySchema };
