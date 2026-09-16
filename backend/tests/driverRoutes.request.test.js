const request = require('supertest');
const app = require('../src/app');

describe('driver routes — request validation (no DB required)', () => {
  test('GET /api/v1/drivers without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/drivers');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/drivers/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/drivers/me');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/drivers without a token returns 401', async () => {
    const res = await request(app).post('/api/v1/drivers').send({});
    expect(res.status).toBe(401);
  });

  test('DELETE /api/v1/drivers/:id without a token returns 401', async () => {
    const res = await request(app).delete('/api/v1/drivers/abc123');
    expect(res.status).toBe(401);
  });
});
