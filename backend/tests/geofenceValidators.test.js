const { createGeofenceSchema, updateGeofenceSchema } = require('../src/validators/geofenceValidators');

describe('createGeofenceSchema', () => {
  const valid = { name: 'Warehouse', latitude: 12.9716, longitude: 77.5946, radiusMeters: 200 };

  test('accepts a valid payload', () => {
    expect(createGeofenceSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects a zero or negative radius', () => {
    expect(createGeofenceSchema.safeParse({ ...valid, radiusMeters: 0 }).success).toBe(false);
    expect(createGeofenceSchema.safeParse({ ...valid, radiusMeters: -50 }).success).toBe(false);
  });

  test('rejects an out-of-range latitude', () => {
    expect(createGeofenceSchema.safeParse({ ...valid, latitude: 200 }).success).toBe(false);
  });

  test('rejects a missing name', () => {
    const { name, ...rest } = valid;
    expect(createGeofenceSchema.safeParse(rest).success).toBe(false);
  });

  test('accepts an explicit notifyOnEvent', () => {
    const result = createGeofenceSchema.safeParse({ ...valid, notifyOnEvent: false });
    expect(result.success).toBe(true);
    expect(result.data.notifyOnEvent).toBe(false);
  });
});

describe('updateGeofenceSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateGeofenceSchema.safeParse({}).success).toBe(false);
  });

  test('accepts toggling isActive alone', () => {
    expect(updateGeofenceSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});
