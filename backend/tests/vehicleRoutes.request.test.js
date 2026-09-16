const request = require('supertest');
const app = require('../src/app');

describe('vehicle routes — request validation (no DB required)', () => {
  test('GET /api/v1/vehicles without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/vehicles without a token returns 401', async () => {
    const res = await request(app).post('/api/v1/vehicles').send({});
    expect(res.status).toBe(401);
  });

  test('PATCH /api/v1/vehicles/:id without a token returns 401', async () => {
    const res = await request(app).patch('/api/v1/vehicles/abc123').send({ status: 'MAINTENANCE' });
    expect(res.status).toBe(401);
  });

  test('DELETE /api/v1/vehicles/:id without a token returns 401', async () => {
    const res = await request(app).delete('/api/v1/vehicles/abc123');
    expect(res.status).toBe(401);
  });
});
