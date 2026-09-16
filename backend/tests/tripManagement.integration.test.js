const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Trip CRUD + state machine + business rules (§9/§48). Requires a real
// database — same setup as tests/authFlow.integration.test.js. Change
// `describe.skip` to `describe` once DATABASE_URL points at a live
// Postgres instance.
describe.skip('trip management (requires a live database)', () => {
  const adminEmail = `trip-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken;
  let vehicleId, driverId, driverUserId, driverToken;
  let expiredLicenseDriverId, retiredVehicleId, inactiveDriverId;

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleId, retiredVehicleId] } } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  });

  const createVehicle = async (suffix) => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `TRIP-${Date.now()}-${suffix}`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });
    return res.body.data.vehicle.id;
  };

  const createDriver = async (suffix, licenseExpiry = '2028-01-01') => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Trip Driver ${suffix}`,
        email: `trip-driver-${suffix}-${Date.now()}@example.com`,
        licenseNumber: `TRIP-DL-${Date.now()}-${suffix}`,
        licenseType: 'LMV',
        licenseExpiry,
      });
    return res.body.data.driver.id;
  };

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Trip Org', name: 'Trip Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    vehicleId = await createVehicle('main');
    driverId = await createDriver('main');
    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    driverUserId = driverRecord.userId;
    const driverUser = await prisma.user.findUnique({ where: { id: driverUserId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;

    retiredVehicleId = await createVehicle('retired');
    await request(app).delete(`/api/v1/vehicles/${retiredVehicleId}`).set('Authorization', `Bearer ${adminToken}`);

    expiredLicenseDriverId = await createDriver('expired', '2000-01-01');

    inactiveDriverId = await createDriver('inactive');
    await prisma.driver.update({ where: { id: inactiveDriverId }, data: { status: 'SUSPENDED' } });
  });

  let tripId;

  test('creates a scheduled trip', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId, source: 'Warehouse', destination: 'Customer Site' });

    expect(res.status).toBe(201);
    expect(res.body.data.trip.status).toBe('SCHEDULED');
    tripId = res.body.data.trip.id;
  });

  test('cannot schedule a trip for a retired vehicle', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: retiredVehicleId, driverId, source: 'A', destination: 'B' });
    expect(res.status).toBe(400);
  });

  test('cannot assign a trip to a suspended driver', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId: inactiveDriverId, source: 'A', destination: 'B' });
    expect(res.status).toBe(400);
  });

  test('cannot assign a trip to a driver with an expired license', async () => {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId: expiredLicenseDriverId, source: 'A', destination: 'B' });
    expect(res.status).toBe(400);
  });

  test('a driver other than the assigned one cannot start the trip', async () => {
    const otherDriverId = await createDriver('other');
    const otherDriverRecord = await prisma.driver.findUnique({ where: { id: otherDriverId } });
    const otherUser = await prisma.user.findUnique({ where: { id: otherDriverRecord.userId } });
    const otherToken = (await tokenService.issueTokenPair(otherUser)).accessToken;

    const res = await request(app).post(`/api/v1/trips/${tripId}/start`).set('Authorization', `Bearer ${otherToken}`).send({});
    expect(res.status).toBe(403);
  });

  test('a trip cannot start while its vehicle is in maintenance', async () => {
    await request(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'MAINTENANCE' });

    const res = await request(app).post(`/api/v1/trips/${tripId}/start`).set('Authorization', `Bearer ${driverToken}`).send({});
    expect(res.status).toBe(400);

    await request(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
  });

  test('the assigned driver can start the trip, recording startOdometer', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ startOdometer: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.data.trip.status).toBe('IN_PROGRESS');
    expect(res.body.data.trip.startOdometer).toBe(1000);
  });

  test('trip details can no longer be edited once in progress', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'too late' });
    expect(res.status).toBe(400);
  });

  test('pause then resume', async () => {
    const pauseRes = await request(app).post(`/api/v1/trips/${tripId}/pause`).set('Authorization', `Bearer ${driverToken}`);
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.trip.status).toBe('PAUSED');

    const resumeRes = await request(app).post(`/api/v1/trips/${tripId}/resume`).set('Authorization', `Bearer ${driverToken}`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.trip.status).toBe('IN_PROGRESS');
  });

  test('ending the trip computes distance and bumps the vehicle mileage', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/end`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ endOdometer: 1050 });

    expect(res.status).toBe(200);
    expect(res.body.data.trip.status).toBe('COMPLETED');
    expect(res.body.data.trip.distance).toBe(50);

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    expect(vehicle.currentMileage).toBeGreaterThanOrEqual(1050);
  });

  test('a completed trip cannot be started again', async () => {
    const res = await request(app).post(`/api/v1/trips/${tripId}/start`).set('Authorization', `Bearer ${driverToken}`).send({});
    expect(res.status).toBe(400);
  });

  test('GET /trips/me returns only the calling driver\'s trips', async () => {
    const res = await request(app).get('/api/v1/trips/me').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.trips.every((t) => t.driverId === driverId)).toBe(true);
  });

  test('a scheduled trip can be cancelled, and cancelling twice is rejected', async () => {
    const create = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId, source: 'A', destination: 'B' });
    const cancelableTripId = create.body.data.trip.id;

    const cancelRes = await request(app)
      .post(`/api/v1/trips/${cancelableTripId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.trip.status).toBe('CANCELLED');

    const again = await request(app)
      .post(`/api/v1/trips/${cancelableTripId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(again.status).toBe(400);
  });
});
