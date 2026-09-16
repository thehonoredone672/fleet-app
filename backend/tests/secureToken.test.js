const { generateRawToken, hashToken } = require('../src/utils/secureToken');

describe('secureToken', () => {
  test('generateRawToken produces distinct, sufficiently long tokens', () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
  });

  test('hashToken is deterministic for the same input', () => {
    const raw = 'fixed-input-value';
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  test('hashToken produces different output for different input', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  test('hashToken never returns the raw token back', () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).not.toBe(raw);
  });
});
