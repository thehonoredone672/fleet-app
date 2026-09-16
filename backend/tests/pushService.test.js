jest.mock('../src/config/env', () => ({ pushNotificationKey: 'demo-push-key' }));

const pushService = require('../src/services/pushService');
const logger = require('../src/utils/logger');

describe('pushService.sendPush', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('is a no-op when there is no pushToken (no network call)', async () => {
    await pushService.sendPush(null, { title: 'Hi', message: 'There' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('sends the expected request shape to Expo when a token is present', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ data: { status: 'ok' } }) });

    await pushService.sendPush('ExponentPushToken[abc123]', {
      title: 'Trip assigned',
      message: 'Warehouse to Customer Site',
      data: { type: 'TRIP_ASSIGNED' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer demo-push-key');

    const body = JSON.parse(options.body);
    expect(body.to).toBe('ExponentPushToken[abc123]');
    expect(body.title).toBe('Trip assigned');
    expect(body.body).toBe('Warehouse to Customer Site');
    expect(body.data).toEqual({ type: 'TRIP_ASSIGNED' });
  });

  test('logs but does not throw on a non-ok response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 400 });
    await expect(pushService.sendPush('token', { title: 'x', message: 'y' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  test('logs but does not throw when Expo reports an error for the token', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ data: { status: 'error', message: 'DeviceNotRegistered' } }) });
    await expect(pushService.sendPush('token', { title: 'x', message: 'y' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  test('logs but does not throw on a network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(pushService.sendPush('token', { title: 'x', message: 'y' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
