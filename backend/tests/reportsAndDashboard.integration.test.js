const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Dashboard KPIs and the four report endpoints, against a small but real
// data scenario (one completed trip, one fuel record, one completed
// maintenance job) so the computed numbers can be checked precisely, not
// just "the endpoint responds." Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe.skip('reports and dashboard (requires a live database)', () => {
  const adminEmail = `report-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';
  const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const dateQuery = `dateFrom=${dateFrom}&dateTo=${dateTo}`;

  let adminToken, viewerToken, driverToken, vehicleId, driverId;

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { vehicleId } });
    await prisma.fuelRecord.deleteMany({ where: { vehicleId } });
    await prisma.maintenance.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Report Org', name: 'Report Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const viewerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Report Viewer', email: `report-viewer-${Date.now()}@example.com`, role: 'VIEWER' });
    const viewerUser = await prisma.user.findUnique({ where: { id: viewerInvite.body.data.user.id } });
    viewerToken = (await tokenService.issueTokenPair(viewerUser)).accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `RPT-${Date.now()}`,
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
        name: 'Report Driver',
        email: `report-driver-${Date.now()}@example.com`,
        licenseNumber: `RPT-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    driverId = driverRes.body.data.driver.id;
    await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${adminToken}`).send({ vehicleId, driverId });

    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;

    // One completed trip: 2 hours, 100km.
    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId, source: 'A', destination: 'B' });
    const tripId = tripRes.body.data.trip.id;
    await request(app).post(`/api/v1/trips/${tripId}/start`).set('Authorization', `Bearer ${driverToken}`).send({ startOdometer: 1000 });
    await prisma.trip.update({ where: { id: tripId }, data: { startTime: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    await request(app).post(`/api/v1/trips/${tripId}/end`).set('Authorization', `Bearer ${driverToken}`).send({ endOdometer: 1100 });

    // One fuel record.
    await request(app)
      .post('/api/v1/fuel')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, fuelType: 'DIESEL', quantity: 10, pricePerLiter: 1.5, odometer: 1100 });

    // One completed maintenance job.
    const maintRes = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, type: 'OIL', description: 'Oil change' });
    await request(app)
      .patch(`/api/v1/maintenance/${maintRes.body.data.maintenance.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED', cost: 500 });
  });

  test('dashboard KPIs reflect the seeded data', async () => {
    const res = await request(app).get(`/api/v1/dashboard/kpis?${dateQuery}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fleet.totalVehicles).toBeGreaterThanOrEqual(1);
    expect(res.body.data.trips.completedTrips).toBeGreaterThanOrEqual(1);
    expect(res.body.data.distance.totalKm).toBeGreaterThanOrEqual(100);
    expect(res.body.data.costs.maintenanceCost).toBeGreaterThanOrEqual(500);
    expect(res.body.data.costs.fuelCost).toBeGreaterThanOrEqual(15);
    expect(res.body.data.fleetUtilizationPercent).toBeGreaterThan(0);
  });

  test('GET /reports/fleet includes the vehicle with its trip/utilization figures', async () => {
    const res = await request(app).get(`/api/v1/reports/fleet?${dateQuery}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.data.vehicles.find((v) => v.vehicleId === vehicleId);
    expect(entry).toBeDefined();
    expect(entry.tripsCompleted).toBeGreaterThanOrEqual(1);
    expect(entry.activeHours).toBeGreaterThanOrEqual(1.9);
    expect(entry.totalDistance).toBeGreaterThanOrEqual(100);
  });

  test('GET /reports/fuel includes a per-vehicle breakdown', async () => {
    const res = await request(app).get(`/api/v1/reports/fuel?${dateQuery}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.data.byVehicle.find((v) => v.vehicleId === vehicleId);
    expect(entry).toBeDefined();
    expect(entry.totalQuantity).toBeGreaterThanOrEqual(10);
  });

  test('GET /reports/maintenance reflects the completed job', async () => {
    const res = await request(app).get(`/api/v1/reports/maintenance?${dateQuery}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.completedCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.summary.totalCost).toBeGreaterThanOrEqual(500);
  });

  test('GET /reports/drivers includes the driver with trip/fuel figures and a null incidents placeholder', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/drivers?driverId=${driverId}&${dateQuery}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.drivers.length).toBe(1);
    expect(res.body.data.drivers[0].tripsCompleted).toBeGreaterThanOrEqual(1);
    expect(res.body.data.drivers[0].reportedIncidents).toBeNull();
  });

  test('a VIEWER can read reports; a DRIVER cannot', async () => {
    const viewerRes = await request(app).get('/api/v1/reports/fleet').set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerRes.status).toBe(200);

    const driverRes = await request(app).get('/api/v1/reports/fleet').set('Authorization', `Bearer ${driverToken}`);
    expect(driverRes.status).toBe(403);
  });
});
