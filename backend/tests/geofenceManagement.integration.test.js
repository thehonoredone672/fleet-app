const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Geofence CRUD, and entry/exit detection wired into GPS ingestion
// (§19/§48). Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('geofence management (requires a live database)', () => {
  const adminEmail = `geo-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `geo-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  // Warehouse geofence centered here with a 200m radius.
  const CENTER = { latitude: 12.9716, longitude: 77.5946 };
  const INSIDE = { latitude: 12.9716, longitude: 77.5946 }; // dead center
  const OUTSIDE = { latitude: 13.05, longitude: 77.65 }; // several km away

  let adminToken, otherOrgAdminToken, managerToken, vehicleId, driverId, driverToken, geofenceId;

  afterAll(async () => {
    await prisma.geofenceEvent.deleteMany({ where: { vehicleId } });
    await prisma.geofence.deleteMany({ where: { id: geofenceId } });
    await prisma.alert.deleteMany({ where: { vehicleId } });
    await prisma.location.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Geo Org', name: 'Geo Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Geo Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    const managerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Geo Manager', email: `geo-manager-${Date.now()}@example.com`, role: 'FLEET_MANAGER' });
    const managerUser = await prisma.user.findUnique({ where: { id: managerInvite.body.data.user.id } });
    managerToken = (await tokenService.issueTokenPair(managerUser)).accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `GEO-${Date.now()}`,
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
        name: 'Geo Driver',
        email: `geo-driver-${Date.now()}@example.com`,
        licenseNumber: `GEO-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    driverId = driverRes.body.data.driver.id;
    await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${adminToken}`).send({ vehicleId, driverId });

    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;
  });

  test('an admin can create a geofence', async () => {
    const res = await request(app)
      .post('/api/v1/geofences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Warehouse', latitude: CENTER.latitude, longitude: CENTER.longitude, radiusMeters: 200 });
    expect(res.status).toBe(201);
    geofenceId = res.body.data.geofence.id;
  });

  test('FLEET_MANAGER can update but not create or delete a geofence', async () => {
    const updateRes = await request(app)
      .patch(`/api/v1/geofences/${geofenceId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ radiusMeters: 250 });
    expect(updateRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/geofences')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Office', latitude: 1, longitude: 1, radiusMeters: 100 });
    expect(createRes.status).toBe(403);

    const deleteRes = await request(app).delete(`/api/v1/geofences/${geofenceId}`).set('Authorization', `Bearer ${managerToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('a geofence in another org cannot be read (404)', async () => {
    const res = await request(app).get(`/api/v1/geofences/${geofenceId}`).set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('driving into the geofence creates an ENTERED event and a GEOFENCE_BREACH alert', async () => {
    const res = await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, latitude: INSIDE.latitude, longitude: INSIDE.longitude, timestamp: new Date().toISOString() });
    expect(res.status).toBe(201);

    const events = await prisma.geofenceEvent.findMany({ where: { vehicleId, geofenceId } });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('ENTERED');

    const alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'GEOFENCE_BREACH' } });
    expect(alerts.length).toBe(1);
  });

  test('another point still inside does not create a duplicate event', async () => {
    await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, latitude: INSIDE.latitude, longitude: INSIDE.longitude, timestamp: new Date().toISOString() });

    const events = await prisma.geofenceEvent.findMany({ where: { vehicleId, geofenceId } });
    expect(events.length).toBe(1);
  });

  test('driving out of the geofence creates an EXITED event', async () => {
    await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, latitude: OUTSIDE.latitude, longitude: OUTSIDE.longitude, timestamp: new Date().toISOString() });

    const events = await prisma.geofenceEvent.findMany({ where: { vehicleId, geofenceId }, orderBy: { occurredAt: 'asc' } });
    expect(events.length).toBe(2);
    expect(events[1].type).toBe('EXITED');
  });

  test('a deactivated geofence is no longer checked', async () => {
    await request(app).delete(`/api/v1/geofences/${geofenceId}`).set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .post('/api/v1/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, latitude: INSIDE.latitude, longitude: INSIDE.longitude, timestamp: new Date().toISOString() });

    const events = await prisma.geofenceEvent.findMany({ where: { vehicleId, geofenceId } });
    expect(events.length).toBe(2); // unchanged from the previous test
  });
});
