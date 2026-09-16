const crypto = require('crypto');

// For high-entropy random tokens (refresh tokens, password-reset tokens) —
// unlike passwords these aren't user-chosen/low-entropy, so a fast SHA-256
// hash of the raw token is appropriate; bcrypt's slow hashing is unneeded
// here and would only add latency.
const generateRawToken = (bytes = 40) => crypto.randomBytes(bytes).toString('hex');

const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

// Generates a random initial password for invited users (they're expected
// to change it after first login). Built to satisfy the same password
// policy as user-chosen passwords (upper/lower/digit, 8+ chars) by
// construction, using crypto.randomInt for unbiased character selection
// rather than Math.random.
const generateTempPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (chars) => chars[crypto.randomInt(chars.length)];

  const chars = [pick(upper), pick(lower), pick(digits)];
  for (let i = 0; i < 9; i += 1) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

module.exports = { generateRawToken, hashToken, generateTempPassword };
