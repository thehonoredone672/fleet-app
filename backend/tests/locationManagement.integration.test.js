const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// GPS ingestion (REST), latest-location reads, and the live fleet
// snapshot. Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('GPS location ingestion (requires a live database)', () => {
  const adminEmail = `gps-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `gps-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, otherOrgAdminToken;
  let vehicleId, driverId, driverToken;

  afterAll(async () => {
    await prisma.location.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'GPS Org', name: 'GPS Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'GPS Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `GPS-${Date.now()}`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });
    vehicleId = vehicleRes.body.data.vehicle.id;

    const driverRes = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'GPS Driver',
        email: `gps-driver-${Date.now()}@example.com`,
        licenseNumber: `GPS-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    driverId = driverRes.body.data.driver.id;

    await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId });

    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;
  });

  test('a non-driver cannot submit location updates', async () => {
    const res = await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, latitude: 12.9, longitude: 77.6, timestamp: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  test('the assigned driver can submit a single point', async () => {
    const res = await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, latitude: 12.9, longitude: 77.6, timestamp: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.data.accepted).toBe(1);
  });

  test('a vehicleId that does not match the active assignment is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId: 'some-other-vehicle', latitude: 12.9, longitude: 77.6, timestamp: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  test('a duplicate clientId is silently deduped, not double-counted', async () => {
    const clientId = `dedupe-${Date.now()}`;
    const point = { vehicleId, clientId, latitude: 12.91, longitude: 77.61, timestamp: new Date().toISOString() };

    const first = await request(app).post('/api/v1/location').set('Authorization', `Bearer ${driverToken}`).send(point);
    expect(first.body.data.accepted).toBe(1);

    const second = await request(app).post('/api/v1/location').set('Authorization', `Bearer ${driverToken}`).send(point);
    expect(second.status).toBe(201);
    expect(second.body.data.accepted).toBe(0);
  });

  test('a batch of points is accepted in one call', async () => {
    const now = Date.now();
    const batch = [0, 1, 2].map((i) => ({
      vehicleId,
      latitude: 12.9 + i * 0.001,
      longitude: 77.6 + i * 0.001,
      timestamp: new Date(now + i * 1000).toISOString(),
    }));

    const res = await request(app).post('/api/v1/location').set('Authorization', `Bearer ${driverToken}`).send(batch);
    expect(res.status).toBe(201);
    expect(res.body.data.accepted).toBe(3);
  });

  test('GET /vehicles/:id/location returns the most recent point', async () => {
    const res = await request(app)
      .get(`/api/v1/vehicles/${vehicleId}/location`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.location.vehicleId).toBe(vehicleId);
  });

  test('a vehicle in another org cannot be read (404, not 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/vehicles/${vehicleId}/location`)
      .set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('GET /fleet/live includes the vehicle with its latest location', async () => {
    const res = await request(app).get('/api/v1/fleet/live').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.data.vehicles.find((v) => v.id === vehicleId);
    expect(entry).toBeDefined();
    expect(entry.location).not.toBeNull();
  });
});
