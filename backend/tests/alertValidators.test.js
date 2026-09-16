const { listAlertsQuerySchema } = require('../src/validators/alertValidators');

describe('listAlertsQuerySchema', () => {
  test('applies default page/limit and coerces isResolved', () => {
    const result = listAlertsQuerySchema.safeParse({ isResolved: 'false' });
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.isResolved).toBe(false);
  });

  test('rejects an invalid type', () => {
    expect(listAlertsQuerySchema.safeParse({ type: 'ALIEN_INVASION' }).success).toBe(false);
  });

  test('rejects an invalid severity', () => {
    expect(listAlertsQuerySchema.safeParse({ severity: 'EXTREME' }).success).toBe(false);
  });
});
