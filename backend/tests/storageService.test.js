// Mocked so these tests run fully offline with dummy credentials — no
// real Cloudinary/AWS account needed. Signing (Cloudinary's HMAC, S3's
// SigV4 presign) is a pure cryptographic operation that doesn't validate
// credentials against the provider, so a dummy secret still produces a
// correctly-shaped, verifiable signature/URL.
jest.mock('../src/config/env', () => ({
  storageProvider: 'cloudinary',
  cloudinary: { cloudName: 'demo-cloud', apiKey: 'demo-key', apiSecret: 'demo-secret' },
  s3: { bucket: 'demo-bucket', accessKeyId: 'AKIADEMO', secretAccessKey: 'demo-secret', region: 'us-east-1' },
}));

const env = require('../src/config/env');
const storageService = require('../src/services/storageService');
const AppError = require('../src/utils/AppError');

describe('storageService.getUploadCredentials — cloudinary', () => {
  beforeEach(() => {
    env.storageProvider = 'cloudinary';
  });

  test('returns a signed upload form with the expected shape', async () => {
    const result = await storageService.getUploadCredentials({ folder: 'documents/org_1/vehicle_2' });

    expect(result.provider).toBe('cloudinary');
    expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo-cloud/auto/upload');
    expect(result.fields.apiKey).toBe('demo-key');
    expect(result.fields.folder).toBe('documents/org_1/vehicle_2');
    expect(typeof result.fields.signature).toBe('string');
    expect(result.fields.signature.length).toBe(40); // SHA-1 hex digest
  });

  test('the same inputs always produce the same signature (deterministic)', async () => {
    const a = await storageService.getUploadCredentials({ folder: 'documents/org_1/vehicle_2' });
    // Force the same timestamp by stubbing Date.now for both calls.
    const originalNow = Date.now;
    Date.now = () => 1700000000000;
    const b = await storageService.getUploadCredentials({ folder: 'documents/org_1/vehicle_2' });
    const c = await storageService.getUploadCredentials({ folder: 'documents/org_1/vehicle_2' });
    Date.now = originalNow;

    expect(b.fields.signature).toBe(c.fields.signature);
    expect(a).toBeDefined(); // sanity: first call still succeeded
  });

  test('throws a clean AppError if Cloudinary credentials are missing', async () => {
    env.cloudinary = { cloudName: '', apiKey: '', apiSecret: '' };
    await expect(storageService.getUploadCredentials({ folder: 'documents/x' })).rejects.toThrow(AppError);
    env.cloudinary = { cloudName: 'demo-cloud', apiKey: 'demo-key', apiSecret: 'demo-secret' };
  });
});

describe('storageService.getUploadCredentials — s3', () => {
  beforeEach(() => {
    env.storageProvider = 's3';
  });

  test('returns a presigned PUT URL and the resulting public fileUrl', async () => {
    const result = await storageService.getUploadCredentials({
      folder: 'documents/org_1/vehicle_2',
      contentType: 'image/jpeg',
    });

    expect(result.provider).toBe('s3');
    expect(result.uploadUrl).toContain('https://demo-bucket.s3.us-east-1.amazonaws.com/');
    expect(result.uploadUrl).toContain('X-Amz-Signature=');
    expect(result.fileUrl).toMatch(/^https:\/\/demo-bucket\.s3\.us-east-1\.amazonaws\.com\/documents\/org_1\/vehicle_2\//);
  });

  test('throws a clean AppError if S3 credentials are missing', async () => {
    env.s3 = { bucket: '', accessKeyId: '', secretAccessKey: '', region: '' };
    await expect(storageService.getUploadCredentials({ folder: 'documents/x' })).rejects.toThrow(AppError);
    env.s3 = { bucket: 'demo-bucket', accessKeyId: 'AKIADEMO', secretAccessKey: 'demo-secret', region: 'us-east-1' };
  });
});

describe('storageService.getUploadCredentials — unknown provider', () => {
  test('throws a clean AppError', async () => {
    env.storageProvider = 'dropbox';
    await expect(storageService.getUploadCredentials({ folder: 'documents/x' })).rejects.toThrow(AppError);
    env.storageProvider = 'cloudinary';
  });
});

describe('storageService.deleteFile', () => {
  test('is a safe no-op for a falsy fileUrl (no network call attempted)', async () => {
    await expect(storageService.deleteFile(null)).resolves.toBeUndefined();
    await expect(storageService.deleteFile(undefined)).resolves.toBeUndefined();
    await expect(storageService.deleteFile('')).resolves.toBeUndefined();
  });
});
