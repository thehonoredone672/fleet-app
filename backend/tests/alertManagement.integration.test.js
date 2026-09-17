const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');

// Alert list/resolve API. Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('alert management (requires a live database)', () => {
  const adminEmail = `alert-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `alert-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, otherOrgAdminToken, organizationId, vehicleId, alertId;

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Alert Org', name: 'Alert Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;
    organizationId = admin.body.data.user.organizationId;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Alert Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `ALERT-${Date.now()}`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });
    vehicleId = vehicleRes.body.data.vehicle.id;

    const alert = await prisma.alert.create({
      data: { organizationId, vehicleId, type: 'VEHICLE_MAINTENANCE', severity: 'HIGH', message: 'Test alert' },
    });
    alertId = alert.id;
  });

  test('an admin can list alerts for their org', async () => {
    const res = await request(app).get('/api/v1/alerts').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.alerts.some((a) => a.id === alertId)).toBe(true);
  });

  test('an alert from another org cannot be read (404)', async () => {
    const res = await request(app).get(`/api/v1/alerts/${alertId}`).set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('resolving an alert sets isResolved/resolvedById/resolvedAt', async () => {
    const res = await request(app).patch(`/api/v1/alerts/${alertId}/resolve`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.alert.isResolved).toBe(true);
    expect(res.body.data.alert.resolvedAt).not.toBeNull();
  });

  test('resolving an already-resolved alert is rejected', async () => {
    const res = await request(app).patch(`/api/v1/alerts/${alertId}/resolve`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
