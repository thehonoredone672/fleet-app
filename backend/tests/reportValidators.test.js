const { reportQuerySchema, driverReportQuerySchema } = require('../src/validators/reportValidators');

describe('reportQuerySchema', () => {
  test('accepts an empty query (defaults resolved later in the service)', () => {
    expect(reportQuerySchema.safeParse({}).success).toBe(true);
  });

  test('coerces dateFrom/dateTo to Date objects', () => {
    const result = reportQuerySchema.safeParse({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    expect(result.success).toBe(true);
    expect(result.data.dateFrom).toBeInstanceOf(Date);
    expect(result.data.dateTo).toBeInstanceOf(Date);
  });
});

describe('driverReportQuerySchema', () => {
  test('accepts an optional driverId on top of the shared report fields', () => {
    const result = driverReportQuerySchema.safeParse({ driverId: 'drv_1', dateFrom: '2026-01-01' });
    expect(result.success).toBe(true);
    expect(result.data.driverId).toBe('drv_1');
  });
});
