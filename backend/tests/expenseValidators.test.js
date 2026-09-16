const { createExpenseSchema, updateExpenseSchema, listExpenseQuerySchema } = require('../src/validators/expenseValidators');

describe('createExpenseSchema', () => {
  const valid = { vehicleId: 'veh_1', category: 'TOLL', amount: 12.5 };

  test('accepts a minimal valid payload', () => {
    expect(createExpenseSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects an invalid category', () => {
    expect(createExpenseSchema.safeParse({ ...valid, category: 'BRIBERY' }).success).toBe(false);
  });

  test('rejects a zero or negative amount', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  test('rejects an invalid receiptUrl', () => {
    expect(createExpenseSchema.safeParse({ ...valid, receiptUrl: 'not-a-url' }).success).toBe(false);
  });
});

describe('updateExpenseSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateExpenseSchema.safeParse({}).success).toBe(false);
  });

  test('accepts a single-field update', () => {
    expect(updateExpenseSchema.safeParse({ amount: 20 }).success).toBe(true);
  });
});

describe('listExpenseQuerySchema', () => {
  test('applies default page/limit', () => {
    const result = listExpenseQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
  });

  test('rejects an invalid status', () => {
    expect(listExpenseQuerySchema.safeParse({ status: 'MAYBE' }).success).toBe(false);
  });
});
