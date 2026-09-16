const {
  uploadCredentialsSchema,
  createDocumentSchema,
  updateDocumentSchema,
} = require('../src/validators/documentValidators');

describe('uploadCredentialsSchema', () => {
  test('accepts exactly a vehicleId', () => {
    expect(uploadCredentialsSchema.safeParse({ vehicleId: 'veh_1' }).success).toBe(true);
  });

  test('accepts exactly a driverId', () => {
    expect(uploadCredentialsSchema.safeParse({ driverId: 'drv_1' }).success).toBe(true);
  });

  test('rejects both vehicleId and driverId together', () => {
    expect(uploadCredentialsSchema.safeParse({ vehicleId: 'veh_1', driverId: 'drv_1' }).success).toBe(false);
  });

  test('rejects neither vehicleId nor driverId', () => {
    expect(uploadCredentialsSchema.safeParse({}).success).toBe(false);
  });
});

describe('createDocumentSchema', () => {
  const base = { type: 'INSURANCE', fileUrl: 'https://res.cloudinary.com/demo/image/upload/v1/doc.jpg' };

  test('accepts a vehicle document', () => {
    expect(createDocumentSchema.safeParse({ ...base, vehicleId: 'veh_1' }).success).toBe(true);
  });

  test('accepts a driver document', () => {
    expect(createDocumentSchema.safeParse({ ...base, driverId: 'drv_1' }).success).toBe(true);
  });

  test('rejects both vehicleId and driverId together', () => {
    expect(createDocumentSchema.safeParse({ ...base, vehicleId: 'veh_1', driverId: 'drv_1' }).success).toBe(false);
  });

  test('rejects neither vehicleId nor driverId', () => {
    expect(createDocumentSchema.safeParse(base).success).toBe(false);
  });

  test('rejects an invalid document type', () => {
    expect(createDocumentSchema.safeParse({ ...base, vehicleId: 'veh_1', type: 'PASSPORT' }).success).toBe(false);
  });

  test('rejects a non-URL fileUrl', () => {
    expect(createDocumentSchema.safeParse({ ...base, vehicleId: 'veh_1', fileUrl: 'not-a-url' }).success).toBe(false);
  });
});

describe('updateDocumentSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  test('accepts a single-field update', () => {
    expect(updateDocumentSchema.safeParse({ documentNumber: 'ABC123' }).success).toBe(true);
  });
});
