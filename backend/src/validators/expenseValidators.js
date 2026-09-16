const { z } = require('zod');
const { EXPENSE_CATEGORIES } = require('../constants/expenseEnums');

// vehicleId is always required, whether the caller is a driver (must
// match their active assignment — enforced in the service, same pattern
// as fuel/location) or an admin-tier role entering an expense directly.
const createExpenseSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId is required'),
  category: z.enum(EXPENSE_CATEGORIES, { errorMap: () => ({ message: 'Invalid expense category' }) }),
  amount: z.coerce.number().positive('amount must be greater than 0'),
  description: z.string().trim().max(2000).optional(),
  date: z.coerce.date().optional(),
  receiptUrl: z.string().trim().url().optional(),
});

// Only reachable while the expense is still PENDING (enforced in the
// service) — an approved/rejected expense is a closed financial record.
const updateExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    amount: z.coerce.number().positive().optional(),
    description: z.string().trim().max(2000).optional(),
    date: z.coerce.date().optional(),
    receiptUrl: z.string().trim().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const listExpenseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vehicleId: z.string().trim().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  organizationId: z.string().trim().optional(),
});

module.exports = { createExpenseSchema, updateExpenseSchema, listExpenseQuerySchema };
