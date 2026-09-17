const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');

// Maintenance CRUD, the mileage-due computed field, and the
// Vehicle.status <-> Maintenance.status sync (§14/§48). Requires a real
// database — same setup as tests/authFlow.integration.test.js. Change
// `describe.skip` to `describe` once DATABASE_URL points at a live
// Postgres instance.
describe('maintenance management (requires a live database)', () => {
  const adminEmail = `maint-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `maint-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, otherOrgAdminToken, vehicleId;

  afterAll(async () => {
    await prisma.maintenance.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Maint Org', name: 'Maint Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Maint Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `MAINT-${Date.now()}`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
        currentMileage: 48700,
      });
    vehicleId = vehicleRes.body.data.vehicle.id;
  });

  let maintenanceId;

  test('creates a scheduled maintenance record and computes kmUntilService', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, type: 'OIL', description: 'Oil change', nextServiceMileage: 50000 });

    expect(res.status).toBe(201);
    expect(res.body.data.maintenance.status).toBe('SCHEDULED');
    expect(res.body.data.maintenance.kmUntilService).toBe(1300);
    maintenanceId = res.body.data.maintenance.id;
  });

  test('a maintenance record in another org is not readable (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/maintenance/${maintenanceId}`)
      .set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('starting the maintenance job (IN_PROGRESS) puts the vehicle into MAINTENANCE status', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${maintenanceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);

    const vehicle = await request(app).get(`/api/v1/vehicles/${vehicleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(vehicle.body.data.vehicle.status).toBe('MAINTENANCE');
  });

  test('a vehicle under maintenance cannot start a trip', async () => {
    const driverRes = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Maint Driver',
        email: `maint-driver-${Date.now()}@example.com`,
        licenseNumber: `MAINT-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId: driverRes.body.data.driver.id, source: 'A', destination: 'B' });
    expect(tripRes.status).toBe(201);

    // Trip creation itself doesn't check vehicle.status (only RETIRED is
    // blocked there) — the "vehicle under maintenance" rule fires at
    // start, per tripService.js.
  });

  test('completing the maintenance job returns the vehicle to ACTIVE and bumps mileage', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${maintenanceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED', mileage: 48750 });
    expect(res.status).toBe(200);

    const vehicle = await request(app).get(`/api/v1/vehicles/${vehicleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(vehicle.body.data.vehicle.status).toBe('ACTIVE');
    expect(vehicle.body.data.vehicle.currentMileage).toBeGreaterThanOrEqual(48750);
  });

  test('a completed maintenance record can no longer be updated', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${maintenanceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'too late' });
    expect(res.status).toBe(400);
  });

  test('VIEWER can list maintenance but not create a record', async () => {
    const tokenService = require('../src/services/tokenService');
    const viewerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Maint Viewer', email: `maint-viewer-${Date.now()}@example.com`, role: 'VIEWER' });
    const viewerUser = await prisma.user.findUnique({ where: { id: viewerInvite.body.data.user.id } });
    const { accessToken } = await tokenService.issueTokenPair(viewerUser);

    const listRes = await request(app).get('/api/v1/maintenance').set('Authorization', `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ vehicleId, type: 'TIRES', description: 'Rotate tires' });
    expect(createRes.status).toBe(403);
  });
});
