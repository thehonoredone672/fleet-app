const request = require('supertest');
const app = require('../src/app');

describe('maintenance routes — request validation (no DB required)', () => {
  test('GET /api/v1/maintenance without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/maintenance')).status).toBe(401);
  });

  test('POST /api/v1/maintenance without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/maintenance').send({})).status).toBe(401);
  });

  test('PATCH /api/v1/maintenance/:id without a token returns 401', async () => {
    expect((await request(app).patch('/api/v1/maintenance/abc123').send({ status: 'COMPLETED' })).status).toBe(401);
  });
});
