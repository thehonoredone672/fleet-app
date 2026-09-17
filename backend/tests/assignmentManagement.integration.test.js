const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Vehicle-driver assignment: the "one active driver per vehicle, one
// active vehicle per driver" business rule, cross-org rejection, status
// guards, and the GET /vehicles/me + assignedDriver/assignedVehicle
// embedding this phase wires up. Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance, and
// once the partial-unique-index migration from docs/database.md has been
// applied (this suite exercises the app-level guard, not the DB
// constraint, but both should hold).
describe('vehicle-driver assignment (requires a live database)', () => {
  const adminEmail = `asn-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `asn-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken;
  let otherOrgAdminToken;
  let vehicleAId, vehicleBId, driverAId, driverBId, onLeaveDriverId, retiredVehicleId;
  let otherOrgVehicleId, otherOrgDriverId;

  afterAll(async () => {
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId: { in: [vehicleAId, vehicleBId, retiredVehicleId] } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleAId, vehicleBId, retiredVehicleId, otherOrgVehicleId] } } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  const createVehicle = async (token, suffix) => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registrationNumber: `ASN-${Date.now()}-${suffix}`,
        vehicleType: 'VAN',
        make: 'Ford',
        model: 'Transit',
        year: 2021,
        fuelType: 'DIESEL',
      });
    return res.body.data.vehicle.id;
  };

  const createDriver = async (token, suffix) => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Driver ${suffix}`,
        email: `asn-driver-${suffix}-${Date.now()}@example.com`,
        licenseNumber: `ASN-DL-${Date.now()}-${suffix}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    return res.body.data.driver.id;
  };

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Assignment Org', name: 'Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    vehicleAId = await createVehicle(adminToken, 'A');
    vehicleBId = await createVehicle(adminToken, 'B');
    driverAId = await createDriver(adminToken, 'A');
    driverBId = await createDriver(adminToken, 'B');
    otherOrgVehicleId = await createVehicle(otherOrgAdminToken, 'X');
    otherOrgDriverId = await createDriver(otherOrgAdminToken, 'X');

    retiredVehicleId = await createVehicle(adminToken, 'RETIRED');
    await request(app).delete(`/api/v1/vehicles/${retiredVehicleId}`).set('Authorization', `Bearer ${adminToken}`);

    onLeaveDriverId = await createDriver(adminToken, 'LEAVE');
    await prisma.driver.update({ where: { id: onLeaveDriverId }, data: { status: 'ON_LEAVE' } });
  });

  let assignmentId;

  test('creates an active assignment', async () => {
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: vehicleAId, driverId: driverAId });

    expect(res.status).toBe(201);
    expect(res.body.data.assignment.isActive).toBe(true);
    assignmentId = res.body.data.assignment.id;
  });

  test('a vehicle already carrying an active assignment cannot be assigned again', async () => {
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: vehicleAId, driverId: driverBId });
    expect(res.status).toBe(409);
  });

  test('a driver already actively assigned cannot be assigned to another vehicle', async () => {
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: vehicleBId, driverId: driverAId });
    expect(res.status).toBe(409);
  });

  test('vehicle and driver from different organizations cannot be paired', async () => {
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: otherOrgVehicleId, driverId: driverBId });
    // The vehicle belongs to another org, so the requester (org A admin)
    // gets a 404 on it before the cross-org-pairing check is even reached.
    expect(res.status).toBe(404);
  });

  test('a retired vehicle cannot be assigned', async () => {
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: retiredVehicleId, driverId: driverBId });
    expect(res.status).toBe(400);
  });

  test('a non-ACTIVE driver cannot be assigned', async () => {
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: vehicleBId, driverId: onLeaveDriverId });
    expect(res.status).toBe(400);
  });

  test('GET /vehicles/:id shows the assigned driver, and GET /drivers/:id shows the assigned vehicle', async () => {
    const vehicleRes = await request(app)
      .get(`/api/v1/vehicles/${vehicleAId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(vehicleRes.body.data.vehicle.assignedDriver.id).toBe(driverAId);

    const driverRes = await request(app)
      .get(`/api/v1/drivers/${driverAId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(driverRes.body.data.driver.assignedVehicle.id).toBe(vehicleAId);
  });

  test('GET /vehicles/me returns the assigned vehicle for the driver themself', async () => {
    const driverRecord = await prisma.driver.findUnique({ where: { id: driverAId } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    const { accessToken } = await tokenService.issueTokenPair(driverUser);

    const res = await request(app).get('/api/v1/vehicles/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.id).toBe(vehicleAId);
  });

  test('unassign frees both the vehicle and the driver for reassignment', async () => {
    const res = await request(app)
      .patch(`/api/v1/assignments/${assignmentId}/unassign`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.assignment.isActive).toBe(false);
    expect(res.body.data.assignment.unassignedAt).not.toBeNull();

    const again = await request(app)
      .patch(`/api/v1/assignments/${assignmentId}/unassign`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(again.status).toBe(400);

    const reassign = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId: vehicleAId, driverId: driverBId });
    expect(reassign.status).toBe(201);
  });

  test('VIEWER can list assignments but not create one', async () => {
    const viewerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Org Viewer', email: `asn-viewer-${Date.now()}@example.com`, role: 'VIEWER' });
    const viewerUser = await prisma.user.findUnique({ where: { id: viewerInvite.body.data.user.id } });
    const { accessToken } = await tokenService.issueTokenPair(viewerUser);

    const listRes = await request(app).get('/api/v1/assignments').set('Authorization', `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ vehicleId: vehicleBId, driverId: driverAId });
    expect(createRes.status).toBe(403);
  });
});
