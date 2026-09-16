const {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('../src/validators/authValidators');

describe('registerSchema', () => {
  const valid = {
    organizationName: 'Acme Logistics',
    name: 'Jane Doe',
    email: 'Jane@Example.com',
    password: 'Passw0rd',
  };

  test('accepts a valid payload and lowercases email', () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data.email).toBe('jane@example.com');
  });

  test('rejects a password missing an uppercase letter', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'password1' });
    expect(result.success).toBe(false);
  });

  test('rejects a password missing a number', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'Password' });
    expect(result.success).toBe(false);
  });

  test('rejects a short password', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'Pa1' });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid email', () => {
    const result = registerSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  test('rejects a missing organization name', () => {
    const { organizationName, ...rest } = valid;
    const result = registerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  test('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });

  test('accepts a valid payload', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'anything' });
    expect(result.success).toBe(true);
  });
});

describe('resetPasswordSchema / changePasswordSchema', () => {
  test('resetPasswordSchema requires a token', () => {
    const result = resetPasswordSchema.safeParse({ token: '', newPassword: 'Passw0rd' });
    expect(result.success).toBe(false);
  });

  test('changePasswordSchema enforces the same password strength rules', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'whatever',
      newPassword: 'weak',
    });
    expect(result.success).toBe(false);
  });
});
