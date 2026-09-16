const request = require('supertest');
const app = require('../src/app');

describe('alert routes — request validation (no DB required)', () => {
  test('GET /api/v1/alerts without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/alerts')).status).toBe(401);
  });

  test('GET /api/v1/alerts/:id without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/alerts/abc123')).status).toBe(401);
  });

  test('PATCH /api/v1/alerts/:id/resolve without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/alerts/abc123/resolve')).status).toBe(401);
  });
});
