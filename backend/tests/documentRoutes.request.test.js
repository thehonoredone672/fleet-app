const request = require('supertest');
const app = require('../src/app');

describe('document routes — request validation (no DB required)', () => {
  test('POST /api/v1/documents/upload-credentials without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/documents/upload-credentials').send({})).status).toBe(401);
  });

  test('POST /api/v1/documents without a token returns 401', async () => {
    expect((await request(app).post('/api/v1/documents').send({})).status).toBe(401);
  });

  test('GET /api/v1/documents without a token returns 401', async () => {
    expect((await request(app).get('/api/v1/documents')).status).toBe(401);
  });

  test('DELETE /api/v1/documents/:id without a token returns 401', async () => {
    expect((await request(app).delete('/api/v1/documents/abc123')).status).toBe(401);
  });
});
