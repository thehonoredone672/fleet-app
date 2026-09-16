const { createFuelRecordSchema, updateFuelRecordSchema } = require('../src/validators/fuelValidators');

describe('createFuelRecordSchema', () => {
  const valid = { vehicleId: 'veh_1', fuelType: 'DIESEL', quantity: 40, pricePerLiter: 1.5, odometer: 12000 };

  test('accepts a minimal valid payload', () => {
    expect(createFuelRecordSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects a zero or negative quantity', () => {
    expect(createFuelRecordSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false);
    expect(createFuelRecordSchema.safeParse({ ...valid, quantity: -5 }).success).toBe(false);
  });

  test('rejects an invalid fuelType', () => {
    expect(createFuelRecordSchema.safeParse({ ...valid, fuelType: 'COAL' }).success).toBe(false);
  });

  test('rejects a negative odometer', () => {
    expect(createFuelRecordSchema.safeParse({ ...valid, odometer: -1 }).success).toBe(false);
  });

  test('never accepts a driverId field as part of the payload shape', () => {
    const result = createFuelRecordSchema.safeParse({ ...valid, driverId: 'someone-elses-id' });
    expect(result.success).toBe(true);
    expect(result.data.driverId).toBeUndefined();
  });

  test('accepts an optional totalCost override', () => {
    const result = createFuelRecordSchema.safeParse({ ...valid, totalCost: 60 });
    expect(result.success).toBe(true);
    expect(result.data.totalCost).toBe(60);
  });

  test('accepts an optional clientId for offline-queue dedup', () => {
    const result = createFuelRecordSchema.safeParse({ ...valid, clientId: 'offline-uuid-123' });
    expect(result.success).toBe(true);
    expect(result.data.clientId).toBe('offline-uuid-123');
  });
});

describe('updateFuelRecordSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateFuelRecordSchema.safeParse({}).success).toBe(false);
  });

  test('accepts a single-field correction', () => {
    expect(updateFuelRecordSchema.safeParse({ odometer: 12050 }).success).toBe(true);
  });
});
