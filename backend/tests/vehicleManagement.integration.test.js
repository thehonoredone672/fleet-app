const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Vehicle CRUD, org-scoping, and RBAC. Requires a real database — same
// setup as tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe.skip('vehicle management (requires a live database)', () => {
  const orgAEmail = `veh-org-a-${Date.now()}@example.com`;
  const orgBEmail = `veh-org-b-${Date.now()}@example.com`;
  const password = 'Passw0rd1';
  const sharedRegistration = `TEST-${Date.now()}`;

  let orgAAdminToken;
  let orgBAdminToken;
  let orgAManagerToken;
  let orgAVehicleId;

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { registrationNumber: sharedRegistration } });
    await prisma.user.deleteMany({ where: { email: { in: [orgAEmail, orgBEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const a = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Vehicle Org A', name: 'Org A Admin', email: orgAEmail, password });
    orgAAdminToken = a.body.data.accessToken;

    const b = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Vehicle Org B', name: 'Org B Admin', email: orgBEmail, password });
    orgBAdminToken = b.body.data.accessToken;

    const managerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ name: 'Org A Manager', email: `manager-${Date.now()}@example.com`, role: 'FLEET_MANAGER' });
    const managerUser = await prisma.user.findUnique({ where: { id: managerInvite.body.data.user.id } });
    orgAManagerToken = (await tokenService.issueTokenPair(managerUser)).accessToken;
  });

  test('FLEET_ADMIN can create a vehicle in their own org', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({
        registrationNumber: sharedRegistration,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.vehicle.registrationNumber).toBe(sharedRegistration.toUpperCase());
    expect(res.body.data.vehicle.status).toBe('ACTIVE');
    orgAVehicleId = res.body.data.vehicle.id;
  });

  test('duplicate registration number within the same org is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({
        registrationNumber: sharedRegistration,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });

    expect(res.status).toBe(409);
  });

  test('the same registration number is allowed in a different organization', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({
        registrationNumber: sharedRegistration,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });

    expect(res.status).toBe(201);
  });

  test('a vehicle from another org is not readable (404, not 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/vehicles/${orgAVehicleId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`);

    expect(res.status).toBe(404);
  });

  test('FLEET_MANAGER can read and update but not create or delete', async () => {
    const readRes = await request(app)
      .get(`/api/v1/vehicles/${orgAVehicleId}`)
      .set('Authorization', `Bearer ${orgAManagerToken}`);
    expect(readRes.status).toBe(200);

    const updateRes = await request(app)
      .patch(`/api/v1/vehicles/${orgAVehicleId}`)
      .set('Authorization', `Bearer ${orgAManagerToken}`)
      .send({ currentMileage: 1200 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.vehicle.currentMileage).toBe(1200);

    const createRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${orgAManagerToken}`)
      .send({
        registrationNumber: `${sharedRegistration}-2`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });
    expect(createRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/vehicles/${orgAVehicleId}`)
      .set('Authorization', `Bearer ${orgAManagerToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('GET /api/v1/vehicles supports search and is org-scoped', async () => {
    const res = await request(app)
      .get(`/api/v1/vehicles?search=${sharedRegistration}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.vehicles.length).toBe(1);
    expect(res.body.data.vehicles[0].id).toBe(orgAVehicleId);
  });

  test('FLEET_ADMIN can retire a vehicle, and retiring twice is rejected', async () => {
    const res = await request(app)
      .delete(`/api/v1/vehicles/${orgAVehicleId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.status).toBe('RETIRED');

    const again = await request(app)
      .delete(`/api/v1/vehicles/${orgAVehicleId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`);
    expect(again.status).toBe(400);
  });
});
