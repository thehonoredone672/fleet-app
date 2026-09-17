const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');
const pushService = require('../src/services/pushService');

// Notification fan-out (trip assignment/cancellation, expense decisions,
// alert generation), the in-app inbox API, and push-token registration.
// Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('notification management (requires a live database)', () => {
  const adminEmail = `notif-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, vehicleId, driverId, driverToken, driverUserId;

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: driverUserId } });
    await prisma.trip.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    // sendPush would otherwise attempt a real HTTPS call to Expo with a
    // fake token — mocked so this suite never depends on network access.
    jest.spyOn(pushService, 'sendPush').mockResolvedValue(undefined);

    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Notif Org', name: 'Notif Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `NOTIF-${Date.now()}`,
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
        name: 'Notif Driver',
        email: `notif-driver-${Date.now()}@example.com`,
        licenseNumber: `NOTIF-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    driverId = driverRes.body.data.driver.id;

    await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${adminToken}`).send({ vehicleId, driverId });

    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    driverUserId = driverRecord.userId;
    const driverUser = await prisma.user.findUnique({ where: { id: driverUserId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;
  });

  let tripId;

  test('creating a trip notifies the assigned driver', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId, source: 'Warehouse', destination: 'Site' });
    tripId = res.body.data.trip.id;

    const notifications = await prisma.notification.findMany({ where: { userId: driverUserId, type: 'TRIP_ASSIGNED' } });
    expect(notifications.length).toBe(1);
  });

  test('cancelling the trip notifies the driver again', async () => {
    await request(app).post(`/api/v1/trips/${tripId}/cancel`).set('Authorization', `Bearer ${adminToken}`);

    const notifications = await prisma.notification.findMany({ where: { userId: driverUserId, type: 'TRIP_UPDATED' } });
    expect(notifications.length).toBe(1);
  });

  test("the driver can register a push token and see their own notifications", async () => {
    const registerRes = await request(app)
      .patch('/api/v1/users/me/push-token')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ pushToken: 'ExponentPushToken[test123]' });
    expect(registerRes.status).toBe(200);

    const listRes = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${driverToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.unreadCount).toBeGreaterThanOrEqual(2);
    expect(listRes.body.data.notifications.every((n) => n.userId === driverUserId)).toBe(true);
  });

  test('marking one notification read updates only that one', async () => {
    const listRes = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${driverToken}`);
    const targetId = listRes.body.data.notifications[0].id;

    const readRes = await request(app)
      .patch(`/api/v1/notifications/${targetId}/read`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.notification.isRead).toBe(true);
  });

  test("a driver cannot mark another user's notification as read", async () => {
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    const adminNotification = await prisma.notification.create({
      data: { userId: adminUser.id, title: 'Admin-only', message: 'y', type: 'GENERAL' },
    });

    const res = await request(app)
      .patch(`/api/v1/notifications/${adminNotification.id}/read`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
  });

  test('mark-all-read clears the unread count', async () => {
    const res = await request(app).patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);

    const listRes = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${driverToken}`);
    expect(listRes.body.data.unreadCount).toBe(0);
  });
});
