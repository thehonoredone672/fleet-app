const request = require('supertest');
const app = require('../src/app');

describe('geofence routes — request validation (no DB required)', () => {
  test('GET /api/v1/geofences without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/geofences')).status).toBe(401);
  });

  test('POST /api/v1/geofences without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/geofences').send({})).status).toBe(401);
  });

  test('DELETE /api/v1/geofences/:id without a token returns 401', async () => {
    expect((await request(app).delete('/api/v1/geofences/abc123')).status).toBe(401);
  });
});
