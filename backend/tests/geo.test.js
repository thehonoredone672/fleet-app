const { haversineDistanceMeters } = require('../src/utils/geo');

describe('haversineDistanceMeters', () => {
  test('is zero for identical coordinates', () => {
    expect(haversineDistanceMeters(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
  });

  test('is symmetric', () => {
    const a = haversineDistanceMeters(12.9716, 77.5946, 13.0827, 80.2707);
    const b = haversineDistanceMeters(13.0827, 80.2707, 12.9716, 77.5946);
    expect(a).toBeCloseTo(b, 6);
  });

  test('matches a known approximate distance (Bangalore to Chennai, ~290km)', () => {
    const meters = haversineDistanceMeters(12.9716, 77.5946, 13.0827, 80.2707);
    expect(meters).toBeGreaterThan(280000);
    expect(meters).toBeLessThan(300000);
  });

  test('a small offset (~111m per 0.001 degree latitude) is in the expected range', () => {
    const meters = haversineDistanceMeters(12.9716, 77.5946, 12.9726, 77.5946);
    expect(meters).toBeGreaterThan(100);
    expect(meters).toBeLessThan(120);
  });
});
