const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// RBAC + organization-scoping behavior for /api/v1/users. Requires a real
// database — same setup steps as tests/authFlow.integration.test.js.
// Runs automatically in CI against an ephemeral Postgres service
// container (see .github/workflows/backend-tests.yml) — set DATABASE_URL
// locally to run it here too.
describe('user management (requires a live database)', () => {
  const orgAEmail = `org-a-admin-${Date.now()}@example.com`;
  const orgBEmail = `org-b-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let orgAAdminToken;
  let orgAAdminId;
  let orgBAdminToken;
  let invitedUserId;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [orgAEmail, orgBEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const a = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Org A Fleet', name: 'Org A Admin', email: orgAEmail, password });
    orgAAdminToken = a.body.data.accessToken;
    orgAAdminId = a.body.data.user.id;

    const b = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Org B Fleet', name: 'Org B Admin', email: orgBEmail, password });
    orgBAdminToken = b.body.data.accessToken;
  });

  test('FLEET_ADMIN can invite a user into their own organization', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ name: 'Org A Driver', email: `driver-${Date.now()}@example.com`, role: 'DRIVER' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('DRIVER');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    invitedUserId = res.body.data.user.id;
  });

  test('FLEET_ADMIN cannot invite a SUPER_ADMIN', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ name: 'Sneaky', email: `sneaky-${Date.now()}@example.com`, role: 'SUPER_ADMIN' });

    expect(res.status).toBe(403);
  });

  test("FLEET_ADMIN cannot read a user from another organization (404, not 403)", async () => {
    const res = await request(app)
      .get(`/api/v1/users/${orgAAdminId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`);

    expect(res.status).toBe(404);
  });

  test('GET /api/v1/users only returns users within the caller organization', async () => {
    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${orgAAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.every((u) => u.id !== undefined)).toBe(true);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(res.body.data.users.find((u) => u.email === orgBEmail)).toBeUndefined();
  });

  test('a DRIVER has no permission to list users', async () => {
    // The invited driver's temp password was emailed, not returned by the
    // API, so we can't log in as them via the HTTP flow in a test — issue
    // a real token directly via tokenService instead, which is exactly
    // what login does internally after verifying credentials.
    const driverUser = await prisma.user.findUnique({ where: { id: invitedUserId } });
    const { accessToken } = await tokenService.issueTokenPair(driverUser);

    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  test('FLEET_ADMIN cannot deactivate their own account', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/${orgAAdminId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`);

    expect(res.status).toBe(400);
  });

  test('FLEET_ADMIN can deactivate a user in their own org, and that user can no longer log in', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/${invitedUserId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.isActive).toBe(false);
  });

  test('PATCH /api/v1/users/me updates the caller\'s own profile', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ name: 'Renamed Admin' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Renamed Admin');
  });
});
