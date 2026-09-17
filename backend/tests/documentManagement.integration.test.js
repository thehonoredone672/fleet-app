const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Document upload-credential issuance, the dual-path (driver ownership /
// admin matrix) create, org-scoped reads, and hard delete. Test fileUrls
// are plain https URLs (not real cloudinary.com/s3 URLs), so
// storageService.deleteFile's provider-detection branches never match —
// no real network call happens even against a live database. Requires a
// real database — same setup as tests/authFlow.integration.test.js.
// Change `describe.skip` to `describe` once DATABASE_URL points at a
// live Postgres instance.
describe('document management (requires a live database)', () => {
  const adminEmail = `doc-admin-${Date.now()}@example.com`;
  const otherOrgAdminEmail = `doc-other-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let adminToken, otherOrgAdminToken, viewerToken, vehicleId, driverId, driverToken;
  let otherDriverId, otherDriverToken;

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { OR: [{ vehicleId }, { driverId }, { driverId: otherDriverId }] } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, otherOrgAdminEmail] } } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Doc Org', name: 'Doc Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const otherAdmin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Doc Other Org', name: 'Other Admin', email: otherOrgAdminEmail, password });
    otherOrgAdminToken = otherAdmin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `DOC-${Date.now()}`,
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
        name: 'Doc Driver',
        email: `doc-driver-${Date.now()}@example.com`,
        licenseNumber: `DOC-DL-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    driverId = driverRes.body.data.driver.id;
    const driverRecord = await prisma.driver.findUnique({ where: { id: driverId } });
    const driverUser = await prisma.user.findUnique({ where: { id: driverRecord.userId } });
    driverToken = (await tokenService.issueTokenPair(driverUser)).accessToken;

    const otherDriverRes = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Other Doc Driver',
        email: `other-doc-driver-${Date.now()}@example.com`,
        licenseNumber: `DOC-DL-2-${Date.now()}`,
        licenseType: 'LMV',
        licenseExpiry: '2028-01-01',
      });
    otherDriverId = otherDriverRes.body.data.driver.id;
    const otherDriverRecord = await prisma.driver.findUnique({ where: { id: otherDriverId } });
    const otherDriverUser = await prisma.user.findUnique({ where: { id: otherDriverRecord.userId } });
    otherDriverToken = (await tokenService.issueTokenPair(otherDriverUser)).accessToken;

    const viewerInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Doc Viewer', email: `doc-viewer-${Date.now()}@example.com`, role: 'VIEWER' });
    const viewerUser = await prisma.user.findUnique({ where: { id: viewerInvite.body.data.user.id } });
    viewerToken = (await tokenService.issueTokenPair(viewerUser)).accessToken;
  });

  test('an admin can request upload credentials for a vehicle', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload-credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId });
    expect(res.status).toBe(200);
    expect(['cloudinary', 's3']).toContain(res.body.data.provider);
  });

  test('a driver can request upload credentials for their own driver record but not another', async () => {
    const own = await request(app)
      .post('/api/v1/documents/upload-credentials')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ driverId });
    expect(own.status).toBe(200);

    const other = await request(app)
      .post('/api/v1/documents/upload-credentials')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ driverId: otherDriverId });
    expect(other.status).toBe(404);
  });

  let vehicleDocId, driverDocId;

  test('an admin can create a vehicle document', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleId, type: 'INSURANCE', fileUrl: 'https://example.com/insurance.pdf', expiryDate: '2027-01-01' });
    expect(res.status).toBe(201);
    vehicleDocId = res.body.data.document.id;
  });

  test('a driver can create their own document but not a vehicle document', async () => {
    const own = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ driverId, type: 'DRIVING_LICENSE', fileUrl: 'https://example.com/license.jpg' });
    expect(own.status).toBe(201);
    driverDocId = own.body.data.document.id;

    const forVehicle = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicleId, type: 'INSURANCE', fileUrl: 'https://example.com/x.jpg' });
    expect(forVehicle.status).toBe(403);
  });

  test("a driver's document list only shows their own documents", async () => {
    const res = await request(app).get('/api/v1/documents').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documents.every((d) => d.driverId === driverId)).toBe(true);
  });

  test("a driver cannot read another driver's document", async () => {
    const res = await request(app).get(`/api/v1/documents/${driverDocId}`).set('Authorization', `Bearer ${otherDriverToken}`);
    expect(res.status).toBe(404);
  });

  test('a document from another org cannot be read by an admin there', async () => {
    const res = await request(app).get(`/api/v1/documents/${vehicleDocId}`).set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(res.status).toBe(404);
  });

  test('an admin sees both vehicle and driver documents in one org-scoped list', async () => {
    const res = await request(app).get('/api/v1/documents').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.documents.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([vehicleDocId, driverDocId]));
  });

  test('a VIEWER cannot create a document', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ vehicleId, type: 'PERMIT', fileUrl: 'https://example.com/permit.pdf' });
    expect(res.status).toBe(403);
  });

  test('an admin can update and then delete a document', async () => {
    const updateRes = await request(app)
      .patch(`/api/v1/documents/${vehicleDocId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ documentNumber: 'POLICY-123' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.document.documentNumber).toBe('POLICY-123');

    const deleteRes = await request(app).delete(`/api/v1/documents/${vehicleDocId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const getRes = await request(app).get(`/api/v1/documents/${vehicleDocId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });
});
