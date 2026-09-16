const {
  createDriverSchema,
  updateDriverSchema,
  updateOwnDriverProfileSchema,
} = require('../src/validators/driverValidators');

describe('createDriverSchema', () => {
  const valid = {
    name: 'Arun Kumar',
    email: 'arun@example.com',
    licenseNumber: 'TN-DL-0001',
    licenseType: 'LMV',
    licenseExpiry: '2027-01-01',
  };

  test('accepts a valid payload and coerces the expiry date', () => {
    const result = createDriverSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data.licenseExpiry).toBeInstanceOf(Date);
  });

  test('rejects a missing license number', () => {
    const { licenseNumber, ...rest } = valid;
    const result = createDriverSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects an invalid license expiry', () => {
    const result = createDriverSchema.safeParse({ ...valid, licenseExpiry: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid email', () => {
    const result = createDriverSchema.safeParse({ ...valid, email: 'nope' });
    expect(result.success).toBe(false);
  });
});

describe('updateDriverSchema', () => {
  test('rejects an empty payload', () => {
    expect(updateDriverSchema.safeParse({}).success).toBe(false);
  });

  test('accepts a status-only update', () => {
    expect(updateDriverSchema.safeParse({ status: 'ON_LEAVE' }).success).toBe(true);
  });

  test('rejects an invalid status', () => {
    expect(updateDriverSchema.safeParse({ status: 'RETIRED' }).success).toBe(false);
  });
});

describe('updateOwnDriverProfileSchema', () => {
  test('requires emergencyContact', () => {
    expect(updateOwnDriverProfileSchema.safeParse({}).success).toBe(false);
  });

  test('does not allow updating license fields via the self-service route', () => {
    const result = updateOwnDriverProfileSchema.safeParse({
      emergencyContact: 'Jane 555-0100',
      licenseNumber: 'FORGED-001',
    });
    // Zod strips unknown keys by default rather than erroring — confirm
    // licenseNumber never survives into the parsed output.
    expect(result.success).toBe(true);
    expect(result.data.licenseNumber).toBeUndefined();
  });
});
