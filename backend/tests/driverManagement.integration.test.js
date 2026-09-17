const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Driver onboarding (User + Driver created together), org-scoping, RBAC,
// and the deactivate-locks-out-login behavior. Requires a real database —
// same setup as tests/authFlow.integration.test.js. Change `describe.skip`
// to `describe` once DATABASE_URL points at a live Postgres instance.
describe('driver management (requires a live database)', () => {
  const orgAEmail = `drv-org-a-${Date.now()}@example.com`;
  const orgBEmail = `drv-org-b-${Date.now()}@example.com`;
  const driverEmail = `drv-${Date.now()}@example.com`;
  const password = 'Passw0rd1';
  const licenseNumber = `DL-${Date.now()}`;

  let orgAAdminToken;
  let orgBAdminToken;
  let orgAManagerToken;
  let driverId;
  let driverUserId;

  afterAll(async () => {
    await prisma.driver.deleteMany({ where: { licenseNumber } });
    await prisma.user.deleteMany({ where: { email: { in: [orgAEmail, orgBEmail, driverEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const a = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Driver Org A', name: 'Org A Admin', email: orgAEmail, password });
    orgAAdminToken = a.body.data.accessToken;

    const b = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Driver Org B', name: 'Org B Admin', email: orgBEmail, password });
    orgBAdminToken = b.body.data.accessToken;

    const managerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ name: 'Org A Manager', email: `drv-manager-${Date.now()}@example.com`, role: 'FLEET_MANAGER' });
    const managerUser = await prisma.user.findUnique({ where: { id: managerInvite.body.data.user.id } });
    orgAManagerToken = (await tokenService.issueTokenPair(managerUser)).accessToken;
  });

  test('FLEET_ADMIN can onboard a driver (creates User + Driver together)', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({
        name: 'New Driver',
        email: driverEmail,
        licenseNumber,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.driver.status).toBe('ACTIVE');
    expect(res.body.data.driver.user.email).toBe(driverEmail);
    expect(res.body.data.driver.user.passwordHash).toBeUndefined();
    driverId = res.body.data.driver.id;
    driverUserId = res.body.data.driver.userId;
  });

  test('duplicate email is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({
        name: 'Dupe',
        email: driverEmail,
        licenseNumber: `${licenseNumber}-2`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    expect(res.status).toBe(409);
  });

  test('duplicate license number within the same org is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({
        name: 'Another Driver',
        email: `another-${Date.now()}@example.com`,
        licenseNumber,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    expect(res.status).toBe(409);
  });

  test('a driver from another org is not readable (404, not 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('FLEET_MANAGER can read and update but not create or delete', async () => {
    const readRes = await request(app)
      .get(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${orgAManagerToken}`);
    expect(readRes.status).toBe(200);

    const updateRes = await request(app)
      .patch(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${orgAManagerToken}`)
      .send({ status: 'ON_LEAVE' });
    expect(updateRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${orgAManagerToken}`)
      .send({
        name: 'Forbidden',
        email: `forbidden-${Date.now()}@example.com`,
        licenseNumber: `${licenseNumber}-3`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    expect(createRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${orgAManagerToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('the driver can view and partially update their own profile via /drivers/me', async () => {
    const driverUser = await prisma.user.findUnique({ where: { id: driverUserId } });
    const { accessToken } = await tokenService.issueTokenPair(driverUser);

    const getRes = await request(app).get('/api/v1/drivers/me').set('Authorization', `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.driver.id).toBe(driverId);

    const patchRes = await request(app)
      .patch('/api/v1/drivers/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emergencyContact: 'Jane Doe, 555-0100', licenseNumber: 'FORGED' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.driver.emergencyContact).toBe('Jane Doe, 555-0100');
    expect(patchRes.body.data.driver.licenseNumber).toBe(licenseNumber); // unchanged — not in the schema
  });

  test('deactivating a driver locks out their login', async () => {
    const res = await request(app)
      .delete(`/api/v1/drivers/${driverId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.driver.status).toBe('INACTIVE');
    expect(res.body.data.driver.user.isActive).toBe(false);

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: driverEmail, password: 'irrelevant' });
    expect(loginRes.status).toBe(401);
  });
});
