const { locationPointSchema, ingestLocationSchema } = require('../src/validators/locationValidators');

describe('locationPointSchema', () => {
  const valid = { vehicleId: 'veh_1', latitude: 12.9, longitude: 77.6, timestamp: '2026-01-01T10:00:00Z' };

  test('accepts a minimal valid point', () => {
    expect(locationPointSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects an out-of-range latitude', () => {
    expect(locationPointSchema.safeParse({ ...valid, latitude: 91 }).success).toBe(false);
  });

  test('rejects an out-of-range longitude', () => {
    expect(locationPointSchema.safeParse({ ...valid, longitude: -200 }).success).toBe(false);
  });

  test('rejects a negative speed', () => {
    expect(locationPointSchema.safeParse({ ...valid, speed: -5 }).success).toBe(false);
  });

  test('rejects a heading above 360', () => {
    expect(locationPointSchema.safeParse({ ...valid, heading: 400 }).success).toBe(false);
  });

  test('rejects a missing timestamp', () => {
    const { timestamp, ...rest } = valid;
    expect(locationPointSchema.safeParse(rest).success).toBe(false);
  });

  test('never accepts a driverId field as part of the payload shape (stripped, not trusted)', () => {
    const result = locationPointSchema.safeParse({ ...valid, driverId: 'someone-elses-id' });
    expect(result.success).toBe(true);
    expect(result.data.driverId).toBeUndefined();
  });
});

describe('ingestLocationSchema', () => {
  const point = { vehicleId: 'veh_1', latitude: 12.9, longitude: 77.6, timestamp: '2026-01-01T10:00:00Z' };

  test('accepts a single point', () => {
    expect(ingestLocationSchema.safeParse(point).success).toBe(true);
  });

  test('accepts a batch of points', () => {
    expect(ingestLocationSchema.safeParse([point, point]).success).toBe(true);
  });

  test('rejects an empty batch', () => {
    expect(ingestLocationSchema.safeParse([]).success).toBe(false);
  });

  test('rejects a batch above the 100-point cap', () => {
    const bigBatch = Array.from({ length: 101 }, () => point);
    expect(ingestLocationSchema.safeParse(bigBatch).success).toBe(false);
  });
});
