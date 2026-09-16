const request = require('supertest');
const app = require('../src/app');

describe('fuel routes — request validation (no DB required)', () => {
  test('POST /api/v1/fuel without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/fuel').send({})).status).toBe(401);
  });

  test('GET /api/v1/fuel without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/fuel')).status).toBe(401);
  });

  test('GET /api/v1/fuel/summary without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/fuel/summary')).status).toBe(401);
  });

  test('PATCH /api/v1/fuel/:id without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/fuel/abc123').send({ odometer: 100 })).status).toBe(401);
  });
});
