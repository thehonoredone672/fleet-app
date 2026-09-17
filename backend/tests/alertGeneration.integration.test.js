const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const alertGenerationService = require('../src/services/alertGenerationService');

// Exercises the background-job business logic directly (not through
// BullMQ/Redis — that's just scheduling infrastructure around these same
// functions, see docs/architecture.md#background-jobs). Verifies the
// escalation-not-duplication behavior and the vehicle-offline
// auto-resolve. Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('alert generation (requires a live database)', () => {
  const adminEmail = `alertgen-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, vehicleId, driverId;

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { vehicleId } });
    await prisma.trip.deleteMany({ where: { vehicleId } });
    await prisma.location.deleteMany({ where: { vehicleId } });
    await prisma.maintenance.deleteMany({ where: { vehicleId } });
    await prisma.document.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'AlertGen Org', name: 'AlertGen Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `AGEN-${Date.now()}`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
        currentMileage: 49500,
      });
    vehicleId = vehicleRes.body.data.vehicle.id;

    const driverRes = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'AlertGen Driver',
        email: `alertgen-driver-${Date.now()}@example.com`,
        licenseNumber: `AGEN-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
      });
    driverId = driverRes.body.data.driver.id;

    await request(app).post('/api/v1/assignments').set('Authorization', `Bearer ${adminToken}`).send({ vehicleId, driverId });
  });

  test('a document expiring in ~5 days produces a single HIGH-severity alert, and re-running does not duplicate it', async () => {
    await prisma.document.create({
      data: {
        vehicleId,
        type: 'INSURANCE',
        fileUrl: 'https://example.com/insurance.pdf',
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });

    await alertGenerationService.checkDocumentExpiries();
    await alertGenerationService.checkDocumentExpiries();

    const alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'DOCUMENT_EXPIRY', isResolved: false } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('HIGH');
  });

  test('as the deadline approaches, the same alert escalates instead of duplicating', async () => {
    await prisma.document.updateMany({
      where: { vehicleId, type: 'INSURANCE' },
      data: { expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) },
    });

    await alertGenerationService.checkDocumentExpiries();

    const alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'DOCUMENT_EXPIRY', isResolved: false } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('CRITICAL');
  });

  test('a driver license expiring in 10 days produces a MEDIUM alert', async () => {
    await alertGenerationService.checkLicenseExpiries();

    const alerts = await prisma.alert.findMany({ where: { driverId, type: 'LICENSE_EXPIRY', isResolved: false } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('MEDIUM');
  });

  test('a mileage-based maintenance reminder within 100km produces a HIGH alert', async () => {
    await prisma.maintenance.create({
      data: { vehicleId, type: 'OIL', description: 'Oil change', status: 'SCHEDULED', nextServiceMileage: 49550 },
    });

    await alertGenerationService.checkMaintenanceDue();

    const alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'VEHICLE_MAINTENANCE', isResolved: false } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('HIGH');
  });

  test('a vehicle on an active trip with no recent location is flagged offline, then auto-resolved once it reports again', async () => {
    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId, source: 'A', destination: 'B' });
    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    const tokenService = require('../src/services/tokenService');
    const { accessToken: driverToken } = await tokenService.issueTokenPair(driverUser);
    await request(app).post(`/api/v1/trips/${tripRes.body.data.trip.id}/start`).set('Authorization', `Bearer ${driverToken}`).send({});

    await alertGenerationService.checkVehicleOffline();
    let alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'VEHICLE_OFFLINE', isResolved: false } });
    expect(alerts.length).toBe(1);

    await prisma.location.create({
      data: { vehicleId, latitude: 12.9, longitude: 77.6, timestamp: new Date() },
    });

    await alertGenerationService.checkVehicleOffline();
    alerts = await prisma.alert.findMany({ where: { vehicleId, type: 'VEHICLE_OFFLINE', isResolved: false } });
    expect(alerts.length).toBe(0);
  });
});
