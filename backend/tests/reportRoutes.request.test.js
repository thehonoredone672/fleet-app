const request = require('supertest');
const app = require('../src/app');

describe('dashboard/report routes — request validation (no DB required)', () => {
  test('GET /api/v1/dashboard/kpis without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/dashboard/kpis')).status).toBe(401);
  });

  test('GET /api/v1/reports/fleet without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/reports/fleet')).status).toBe(401);
  });

  test('GET /api/v1/reports/fuel without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/reports/fuel')).status).toBe(401);
  });

  test('GET /api/v1/reports/maintenance without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/reports/maintenance')).status).toBe(401);
  });

  test('GET /api/v1/reports/drivers without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/reports/drivers')).status).toBe(401);
  });
});
