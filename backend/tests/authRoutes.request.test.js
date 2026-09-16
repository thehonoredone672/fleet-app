const request = require('supertest');
const app = require('../src/app');

// These cover request-pipeline behavior that never reaches the database —
// validation, auth-header checks, and 404 handling — so they run without a
// live Postgres instance. End-to-end flow tests (register → login →
// refresh → ...) live in authFlow.integration.test.js and require a real
// database; see that file for why they're skipped here.
describe('auth routes — request validation (no DB required)', () => {
  test('GET /api/v1/health returns ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });

  test('POST /api/v1/auth/register rejects a weak password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      organizationName: 'Acme',
      name: 'Jane',
      email: 'jane@example.com',
      password: 'weak',
    });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('POST /api/v1/auth/login rejects a malformed email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'not-an-email',
      password: 'whatever',
    });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/v1/auth/refresh rejects a missing refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(422);
  });

  test('GET /api/v1/users/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/v1/users/me with a malformed token returns 401', async () => {
    const res = await request(app).get('/api/v1/users/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('unknown route returns a consistent 404 shape', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });
});
