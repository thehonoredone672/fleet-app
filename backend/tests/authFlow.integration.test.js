const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');

// Full end-to-end auth flow against a real database. Skipped by default
// because this sandbox has no reachable PostgreSQL instance (see
// docs/database.md and the Phase 2/3 status notes). To run this suite:
//
//   1. Point DATABASE_URL (backend/.env) at a real Postgres database
//   2. npx prisma migrate dev
//   3. Change `describe.skip` below to `describe`
//   4. npm test -- authFlow.integration.test.js
//
// This is real, runnable test code — not a placeholder — it's just gated
// on infrastructure this environment doesn't have.
describe.skip('auth flow (requires a live database)', () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'Passw0rd1';
  let refreshToken;
  let accessToken;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  test('register creates an org + FLEET_ADMIN user and returns tokens', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      organizationName: 'Integration Test Fleet',
      name: 'Test Admin',
      email,
      password,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('FLEET_ADMIN');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    refreshToken = res.body.data.refreshToken;
    accessToken = res.body.data.accessToken;
  });

  test('duplicate registration is rejected', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      organizationName: 'Another Fleet',
      name: 'Someone Else',
      email,
      password,
    });
    expect(res.status).toBe(409);
  });

  test('login with wrong password is rejected with a generic message', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  test('login with correct credentials succeeds', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  test('GET /users/me with a valid access token returns the user', async () => {
    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });

  test('refresh rotates the refresh token and old one can no longer be reused', async () => {
    const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    const rotated = first.body.data.refreshToken;
    expect(rotated).not.toBe(refreshToken);

    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);

    refreshToken = rotated;
  });

  test('logout revokes the refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);

    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  test('change-password requires the correct current password', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    const token = loginRes.body.data.accessToken;

    const wrong = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass1' });
    expect(wrong.status).toBe(400);

    const right = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'NewPass1' });
    expect(right.status).toBe(200);
  });

  test('forgot-password always returns a generic success response', async () => {
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.data.message).toBe(unknown.body.data.message);
  });
});
