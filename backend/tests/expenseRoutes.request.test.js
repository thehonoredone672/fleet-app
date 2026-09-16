const request = require('supertest');
const app = require('../src/app');

describe('expense routes — request validation (no DB required)', () => {
  test('POST /api/v1/expenses without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/expenses').send({})).status).toBe(401);
  });

  test('GET /api/v1/expenses without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/expenses')).status).toBe(401);
  });

  test('PATCH /api/v1/expenses/:id/approve without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/expenses/abc123/approve')).status).toBe(401);
  });

  test('PATCH /api/v1/expenses/:id/reject without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/expenses/abc123/reject')).status).toBe(401);
  });
});
