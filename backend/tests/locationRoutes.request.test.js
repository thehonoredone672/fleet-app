const request = require('supertest');
const app = require('../src/app');

describe('location/fleet routes — request validation (no DB required)', () => {
  test('POST /api/v1/location without a token returns 401', async () => {
    const res = await request(app).post('/api/v1/location').send({});
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/fleet/live without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/fleet/live');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/vehicles/:id/location without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/vehicles/abc123/location');
    expect(res.status).toBe(401);
  });
});
