const http = require('http');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');
const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const prisma = require('../src/config/database');
const tokenService = require('../src/services/tokenService');

// Socket.IO authentication and the vehicle:location ingest-and-broadcast
// path. Requires a real database and an actual listening port (unlike the
// REST tests, a Socket.IO client can't talk to supertest's in-memory
// app). Requires a real database — same setup as
// tests/authFlow.integration.test.js. Change `describe.skip` to
// `describe` once DATABASE_URL points at a live Postgres instance.
describe('Socket.IO GPS tracking (requires a live database)', () => {
  const adminEmail = `socket-admin-${Date.now()}@example.com`;
  const password = 'Passw0rd1';

  let server;
  let baseUrl;
  let adminToken, driverToken;
  let vehicleId, driverId;
  const openSockets = [];

  const connect = (token) => {
    const socket = ioClient(baseUrl, { auth: { token }, forceNew: true, transports: ['websocket'] });
    openSockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    server = http.createServer(app);
    initSockets(server);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;

    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({ organizationName: 'Socket Org', name: 'Socket Admin', email: adminEmail, password });
    adminToken = admin.body.data.accessToken;

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: `SOCK-${Date.now()}`,
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
        name: 'Socket Driver',
        email: `socket-driver-${Date.now()}@example.com`,
        licenseNumber: `SOCK-DL-${Date.now()}`,
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
  });

  afterEach(() => {
    openSockets.forEach((s) => s.disconnect());
    openSockets.length = 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.location.deleteMany({ where: { vehicleId } });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.$disconnect();
  });

  test('connecting without a token is rejected', (done) => {
    const socket = connect(undefined);
    socket.on('connect_error', (err) => {
      expect(err.message).toMatch(/Authentication required/);
      done();
    });
  });

  test('connecting with a valid token joins the org room and accepts a location event', (done) => {
    const driverSocket = connect(driverToken);
    driverSocket.on('connect', () => {
      driverSocket.emit(
        'vehicle:location',
        { vehicleId, latitude: 12.9, longitude: 77.6, timestamp: new Date().toISOString() },
        (ack) => {
          expect(ack.success).toBe(true);
          expect(ack.data.accepted).toBe(1);
          done();
        }
      );
    });
  });

  test('a manager socket in the same org receives the broadcast', (done) => {
    const managerSocket = connect(adminToken);
    const driverSocket = connect(driverToken);

    managerSocket.on('connect', () => {
      managerSocket.on('vehicle:location', (point) => {
        expect(point.vehicleId).toBe(vehicleId);
        done();
      });

      driverSocket.on('connect', () => {
        driverSocket.emit('vehicle:location', {
          vehicleId,
          latitude: 13.0,
          longitude: 77.7,
          timestamp: new Date().toISOString(),
        });
      });
    });
  });

  test('a mismatched vehicleId is rejected via the ack, not a crash', (done) => {
    const driverSocket = connect(driverToken);
    driverSocket.on('connect', () => {
      driverSocket.emit(
        'vehicle:location',
        { vehicleId: 'not-my-vehicle', latitude: 12.9, longitude: 77.6, timestamp: new Date().toISOString() },
        (ack) => {
          expect(ack.success).toBe(false);
          done();
        }
      );
    });
  });
});
