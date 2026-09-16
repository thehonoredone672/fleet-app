const { severityForDaysUntil, severityForDistanceUntil } = require('../src/utils/alertSeverity');

describe('severityForDaysUntil', () => {
  test('CRITICAL at 1 day or less', () => {
    expect(severityForDaysUntil(0)).toBe('CRITICAL');
    expect(severityForDaysUntil(1)).toBe('CRITICAL');
  });

  test('HIGH between 2 and 7 days', () => {
    expect(severityForDaysUntil(2)).toBe('HIGH');
    expect(severityForDaysUntil(7)).toBe('HIGH');
  });

  test('MEDIUM between 8 and 15 days', () => {
    expect(severityForDaysUntil(8)).toBe('MEDIUM');
    expect(severityForDaysUntil(15)).toBe('MEDIUM');
  });

  test('LOW beyond 15 days', () => {
    expect(severityForDaysUntil(16)).toBe('LOW');
    expect(severityForDaysUntil(30)).toBe('LOW');
  });
});

describe('severityForDistanceUntil', () => {
  test('CRITICAL at or past due (0 or negative km left)', () => {
    expect(severityForDistanceUntil(0)).toBe('CRITICAL');
    expect(severityForDistanceUntil(-50)).toBe('CRITICAL');
  });

  test('HIGH within 100km', () => {
    expect(severityForDistanceUntil(1)).toBe('HIGH');
    expect(severityForDistanceUntil(100)).toBe('HIGH');
  });

  test('MEDIUM beyond 100km', () => {
    expect(severityForDistanceUntil(101)).toBe('MEDIUM');
    expect(severityForDistanceUntil(500)).toBe('MEDIUM');
  });
});
