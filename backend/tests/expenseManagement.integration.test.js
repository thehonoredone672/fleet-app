const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Expense submission (dual-path: driver ownership-gated claim, or
// admin-tier direct entry), the PENDING/APPROVED/REJECTED workflow, and
// the update-only-while-PENDING finality rule (§16). Requires a real
// database — same setup as tests/authFlow.integration.test.js. Change
// `describe.skip` to `describe` once DATABASE_URL points at a live
// Postgres instance.
describe.skip('expense management (requires a live database)', () => {
  const adminEmail = `exp-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `exp-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, otherOrgAdminToken, managerToken, viewerToken, vehicleId, driverToken;

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Expense Org', name: 'Expense Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Expense Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `EXP-${Date.now()}`,
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
        name: 'Expense Driver',
        email: `exp-driver-${Date.now()}@example.com`,
        licenseNumber: `EXP-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, driverId: driverRes.body.data.driver.id });
    const driverRecord = await prisma.driver.findUnique({ where: { id: driverRes.body.data.driver.id } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;

    const managerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Expense Manager', email: `exp-manager-${Date.now()}@example.com`, role: 'FLEET_MANAGER' });
    const managerUser = await prisma.user.findUnique({ where: { id: managerInvite.body.data.user.id } });
    managerToken = (await tokenService.issueTokenPair(managerUser)).accessToken;

    const viewerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Expense Viewer', email: `exp-viewer-${Date.now()}@example.com`, role: 'VIEWER' });
    const viewerUser = await prisma.user.findUnique({ where: { id: viewerInvite.body.data.user.id } });
    viewerToken = (await tokenService.issueTokenPair(viewerUser)).accessToken;
  });

  let driverExpenseId, managerExpenseId;

  test('a driver can submit an expense claim for their own vehicle', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, category: 'TOLL', amount: 4.5 });
    expect(res.status).toBe(201);
    expect(res.body.data.expense.status).toBe('PENDING');
    driverExpenseId = res.body.data.expense.id;
  });

  test('a driver cannot submit for a vehicle other than their own assignment', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId: 'not-my-vehicle', category: 'TOLL', amount: 4.5 });
    expect(res.status).toBe(403);
  });

  test('a VIEWER cannot create an expense', async () => {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ vehicleId, category: 'PARKING', amount: 3 });
    expect(res.status).toBe(403);
  });

  test('FLEET_MANAGER can create an expense directly but cannot approve it', async () => {
    const createRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ vehicleId, category: 'REPAIR', amount: 150 });
    expect(createRes.status).toBe(201);
    managerExpenseId = createRes.body.data.expense.id;

    const approveRes = await request(app)
      .patch(`/api/v1/expenses/${managerExpenseId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(approveRes.status).toBe(403);
  });

  test('an expense from another org cannot be read (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/expenses/${driverExpenseId}`)
      .set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('FLEET_ADMIN can approve one expense and reject another', async () => {
    const approveRes = await request(app)
      .patch(`/api/v1/expenses/${driverExpenseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.expense.status).toBe('APPROVED');

    const rejectRes = await request(app)
      .patch(`/api/v1/expenses/${managerExpenseId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.expense.status).toBe('REJECTED');
  });

  test('an already-decided expense cannot be approved again or edited', async () => {
    const approveAgain = await request(app)
      .patch(`/api/v1/expenses/${driverExpenseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approveAgain.status).toBe(400);

    const editRes = await request(app)
      .patch(`/api/v1/expenses/${driverExpenseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 999 });
    expect(editRes.status).toBe(400);
  });
});
