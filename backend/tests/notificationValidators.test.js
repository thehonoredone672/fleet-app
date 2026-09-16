const { listNotificationsQuerySchema, pushTokenSchema } = require('../src/validators/notificationValidators');

describe('listNotificationsQuerySchema', () => {
  test('applies default page/limit and coerces isRead', () => {
    const result = listNotificationsQuerySchema.safeParse({ isRead: 'true' });
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.isRead).toBe(true);
  });

  test('rejects an invalid type', () => {
    expect(listNotificationsQuerySchema.safeParse({ type: 'CARRIER_PIGEON' }).success).toBe(false);
  });
});

describe('pushTokenSchema', () => {
  test('accepts a non-empty token', () => {
    expect(pushTokenSchema.safeParse({ pushToken: 'ExponentPushToken[abc]' }).success).toBe(true);
  });

  test('rejects an empty token', () => {
    expect(pushTokenSchema.safeParse({ pushToken: '' }).success).toBe(false);
  });

  test('rejects a missing token', () => {
    expect(pushTokenSchema.safeParse({}).success).toBe(false);
  });
});
