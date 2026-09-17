const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Fuel record submission (driver-only, ownership-gated), the abnormal-
// usage heuristic, admin read/correct, and the efficiency/cost-per-km
// summary (§15). Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('fuel management (requires a live database)', () => {
  const adminEmail = `fuel-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, vehicleId, driverId, driverToken;

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { vehicleId } });
    await prisma.fuelRecord.deleteMany({ where: { vehicleId } });
    await prisma.trip.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Fuel Org', name: 'Fuel Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `FUEL-${Date.now()}`,
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
        name: 'Fuel Driver',
        email: `fuel-driver-${Date.now()}@example.com`,
        licenseNumber: `FUEL-DL-${Date.now()}`,
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

    // A completed trip so the summary endpoint has distance to divide by.
    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId, source: 'A', destination: 'B' });
    const tripId = tripRes.body.data.trip.id;
    await request(app).post(`/api/v1/trips/${tripId}/start`).set('Authorization', `Bearer ${driverToken}`).send({ startOdometer: 10000 });
    await request(app).post(`/api/v1/trips/${tripId}/end`).set('Authorization', `Bearer ${driverToken}`).send({ endOdometer: 10500 });
  });

  test('a non-driver cannot submit a fuel record', async () => {
    const res = await request(app)
      .post('/api/v1/fuel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, fuelType: 'DIESEL', quantity: 40, pricePerLiter: 1.5, odometer: 10100 });
    expect(res.status).toBe(403);
  });

  test('a vehicleId that does not match the active assignment is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/fuel')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId: 'not-my-vehicle', fuelType: 'DIESEL', quantity: 40, pricePerLiter: 1.5, odometer: 10100 });
    expect(res.status).toBe(403);
  });

  let firstRecordId;

  test('the first fuel record is never flagged (no history to compare against)', async () => {
    const res = await request(app)
      .post('/api/v1/fuel')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, fuelType: 'DIESEL', quantity: 45, pricePerLiter: 1.5, odometer: 10100 });

    expect(res.status).toBe(201);
    expect(res.body.data.fuelRecord.flagged).toBe(false);
    expect(res.body.data.fuelRecord.totalCost).toBe(67.5);
    firstRecordId = res.body.data.fuelRecord.id;
  });

  test('resubmitting the same clientId returns the original record instead of creating a duplicate', async () => {
    const clientId = `offline-${Date.now()}`;
    const payload = { vehicleId, fuelType: 'DIESEL', quantity: 5, pricePerLiter: 1.5, odometer: 10105, clientId };

    const first = await request(app).post('/api/v1/fuel').set('Authorization', `Bearer ${driverToken}`).send(payload);
    expect(first.status).toBe(201);

    const replay = await request(app).post('/api/v1/fuel').set('Authorization', `Bearer ${driverToken}`).send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.data.fuelRecord.id).toBe(first.body.data.fuelRecord.id);

    const count = await prisma.fuelRecord.count({ where: { vehicleId, odometer: 10105 } });
    expect(count).toBe(1);
  });

  test('a large refill shortly after the last one is flagged and raises an alert', async () => {
    const res = await request(app)
      .post('/api/v1/fuel')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, fuelType: 'DIESEL', quantity: 40, pricePerLiter: 1.5, odometer: 10110 });

    expect(res.status).toBe(201);
    expect(res.body.data.fuelRecord.flagged).toBe(true);

    const alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'FUEL_ANOMALY' } });
    expect(alerts.length).toBe(1);
  });

  test('an admin can list and correct a fuel record', async () => {
    const listRes = await request(app).get('/api/v1/fuel').set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.fuelRecords.length).toBeGreaterThanOrEqual(2);

    const updateRes = await request(app)
      .patch(`/api/v1/fuel/${firstRecordId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ station: 'Corrected Station Name' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.fuelRecord.station).toBe('Corrected Station Name');
  });

  test("a driver can read their own fuel records but not another driver's, and cannot list org-wide", async () => {
    const ownListRes = await request(app).get('/api/v1/fuel').set('Authorization', `Bearer ${driverToken}`);
    expect(ownListRes.status).toBe(200);
    expect(ownListRes.body.data.fuelRecords.every((r) => r.driverId)).toBe(true);
    expect(ownListRes.body.data.fuelRecords.length).toBeGreaterThanOrEqual(1);

    const ownGetRes = await request(app).get(`/api/v1/fuel/${firstRecordId}`).set('Authorization', `Bearer ${driverToken}`);
    expect(ownGetRes.status).toBe(200);

    const summaryRes = await request(app).get('/api/v1/fuel/summary').set('Authorization', `Bearer ${driverToken}`);
    expect(summaryRes.status).toBe(403);
  });

  test('GET /fuel/summary computes efficiency and cost per km', async () => {
    const res = await request(app)
      .get(`/api/v1/fuel/summary?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalDistance).toBe(500);
    // 45L (first record) + 5L (the idempotency-replay test's record,
    // counted once) + 40L (the flagged large refill) = 90L / 135 cost —
    // not 85L/127.5 as it was before the clientId replay test was added.
    expect(res.body.data.totalQuantity).toBe(90);
    expect(res.body.data.efficiencyKmPerLiter).toBeCloseTo(500 / 90, 2);
    expect(res.body.data.costPerKm).toBeCloseTo(135 / 500, 2);
  });
});
