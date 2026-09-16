const request = require('supertest');
const app = require('../src/app');

describe('notification routes — request validation (no DB required)', () => {
  test('GET /api/v1/notifications without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });

  test('PATCH /api/v1/notifications/:id/read without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/notifications/abc123/read')).status).toBe(401);
  });

  test('PATCH /api/v1/notifications/read-all without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/notifications/read-all')).status).toBe(401);
  });

  test('PATCH /api/v1/users/me/push-token without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/users/me/push-token').send({ pushToken: 'x' })).status).toBe(401);
  });
});
