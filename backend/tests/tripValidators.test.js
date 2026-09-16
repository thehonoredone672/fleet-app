const {
  createTripSchema,
  updateTripSchema,
  startTripSchema,
  endTripSchema,
} = require('../src/validators/tripValidators');

describe('createTripSchema', () => {
  const valid = { vehicleId: 'veh_1', driverId: 'drv_1', source: 'Warehouse', destination: 'Customer Site' };

  test('accepts a minimal valid payload', () => {
    expect(createTripSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects a missing source', () => {
    const { source, ...rest } = valid;
    expect(createTripSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects an out-of-range latitude', () => {
    expect(createTripSchema.safeParse({ ...valid, sourceLat: 200 }).success).toBe(false);
  });

  test('rejects an invalid purpose', () => {
    expect(createTripSchema.safeParse({ ...valid, purpose: 'JOYRIDE' }).success).toBe(false);
  });

  test('accepts a valid purpose and coerces scheduledAt', () => {
    const result = createTripSchema.safeParse({ ...valid, purpose: 'DELIVERY', scheduledAt: '2026-01-01' });
    expect(result.success).toBe(true);
    expect(result.data.scheduledAt).toBeInstanceOf(Date);
  });
});

describe('updateTripSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateTripSchema.safeParse({}).success).toBe(false);
  });

  test('accepts a single-field update', () => {
    expect(updateTripSchema.safeParse({ notes: 'Gate code 4521' }).success).toBe(true);
  });
});

describe('startTripSchema / endTripSchema', () => {
  test('startTripSchema accepts an empty body', () => {
    expect(startTripSchema.safeParse({}).success).toBe(true);
  });

  test('startTripSchema rejects a negative odometer', () => {
    expect(startTripSchema.safeParse({ startOdometer: -1 }).success).toBe(false);
  });

  test('endTripSchema accepts an empty body', () => {
    expect(endTripSchema.safeParse({}).success).toBe(true);
  });

  test('endTripSchema coerces a numeric-looking string odometer', () => {
    const result = endTripSchema.safeParse({ endOdometer: '150' });
    expect(result.success).toBe(true);
    expect(result.data.endOdometer).toBe(150);
  });
});
