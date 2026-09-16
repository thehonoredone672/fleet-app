const request = require('supertest');
const app = require('../src/app');

describe('user routes — request validation (no DB required)', () => {
  test('GET /api/v1/users without a token returns 401 before any authorize/validate check', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/users without a token returns 401', async () => {
    const res = await request(app).post('/api/v1/users').send({});
    expect(res.status).toBe(401);
  });

  test('PATCH /api/v1/users/me without a token returns 401', async () => {
    const res = await request(app).patch('/api/v1/users/me').send({ name: 'New Name' });
    expect(res.status).toBe(401);
  });
});
