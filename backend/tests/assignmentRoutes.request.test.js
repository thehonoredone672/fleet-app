const request = require('supertest');
const app = require('../src/app');

describe('assignment routes — request validation (no DB required)', () => {
  test('GET /api/v1/assignments without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/assignments');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/assignments without a token returns 401', async () => {
    const res = await request(app).post('/api/v1/assignments').send({});
    expect(res.status).toBe(401);
  });

  test('PATCH /api/v1/assignments/:id/unassign without a token returns 401', async () => {
    const res = await request(app).patch('/api/v1/assignments/abc123/unassign');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/vehicles/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/vehicles/me');
    expect(res.status).toBe(401);
  });
});
