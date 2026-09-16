const request = require('supertest');
const app = require('../src/app');

describe('trip routes — request validation (no DB required)', () => {
  test('GET /api/v1/trips without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/trips')).status).toBe(401);
  });

  test('GET /api/v1/trips/me without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/trips/me')).status).toBe(401);
  });

  test('POST /api/v1/trips without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/trips').send({})).status).toBe(401);
  });

  test('POST /api/v1/trips/:id/start without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/trips/abc123/start').send({})).status).toBe(401);
  });

  test('POST /api/v1/trips/:id/end without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/trips/abc123/end').send({})).status).toBe(401);
  });

  test('POST /api/v1/trips/:id/cancel without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/trips/abc123/cancel')).status).toBe(401);
  });
});
