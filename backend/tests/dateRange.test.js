const { resolveDateRange, DEFAULT_WINDOW_DAYS } = require('../src/utils/dateRange');

describe('resolveDateRange', () => {
  test('defaults to now for `to` and 30 days earlier for `from` when nothing is given', () => {
    const before = Date.now();
    const { from, to } = resolveDateRange({});
    const after = Date.now();

    expect(to.getTime()).toBeGreaterThanOrEqual(before);
    expect(to.getTime()).toBeLessThanOrEqual(after);
    expect(to.getTime() - from.getTime()).toBeCloseTo(DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000, -3);
  });

  test('uses explicit dateFrom/dateTo when provided', () => {
    const dateFrom = new Date('2026-01-01T00:00:00Z');
    const dateTo = new Date('2026-01-15T00:00:00Z');
    const { from, to } = resolveDateRange({ dateFrom, dateTo });
    expect(from).toBe(dateFrom);
    expect(to).toBe(dateTo);
  });

  test('honors a custom default window when only dateTo is given', () => {
    const dateTo = new Date('2026-02-01T00:00:00Z');
    const { from, to } = resolveDateRange({ dateTo }, 7);
    expect(to).toBe(dateTo);
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
