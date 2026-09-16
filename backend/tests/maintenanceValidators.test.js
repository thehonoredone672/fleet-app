const {
  createMaintenanceSchema,
  updateMaintenanceSchema,
  listMaintenanceQuerySchema,
} = require('../src/validators/maintenanceValidators');

describe('createMaintenanceSchema', () => {
  const valid = { vehicleId: 'veh_1', type: 'OIL', description: 'Oil and filter change' };

  test('accepts a minimal valid payload', () => {
    expect(createMaintenanceSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects an invalid type', () => {
    expect(createMaintenanceSchema.safeParse({ ...valid, type: 'PAINT_JOB' }).success).toBe(false);
  });

  test('rejects a missing description', () => {
    const { description, ...rest } = valid;
    expect(createMaintenanceSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects a negative cost', () => {
    expect(createMaintenanceSchema.safeParse({ ...valid, cost: -100 }).success).toBe(false);
  });

  test('coerces numeric-looking strings for mileage fields', () => {
    const result = createMaintenanceSchema.safeParse({ ...valid, nextServiceMileage: '50000', mileage: '48700' });
    expect(result.success).toBe(true);
    expect(result.data.nextServiceMileage).toBe(50000);
  });
});

describe('updateMaintenanceSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateMaintenanceSchema.safeParse({}).success).toBe(false);
  });

  test('accepts a status-only update', () => {
    expect(updateMaintenanceSchema.safeParse({ status: 'IN_PROGRESS' }).success).toBe(true);
  });

  test('rejects an invalid status', () => {
    expect(updateMaintenanceSchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
});

describe('listMaintenanceQuerySchema', () => {
  test('applies default page/limit and coerces dueBefore', () => {
    const result = listMaintenanceQuerySchema.safeParse({ dueBefore: '2026-06-01' });
    expect(result.success).toBe(true);
    expect(result.data.dueBefore).toBeInstanceOf(Date);
  });
});
