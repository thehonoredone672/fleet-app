const jwt = require('jsonwebtoken');
const ms = require('ms');
const prisma = require('../config/database');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { generateRawToken, hashToken } = require('../utils/secureToken');

const signAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, organizationId: user.organizationId },
    env.jwtSecret,
    { expiresIn: env.jwtAccessExpiresIn }
  );

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw new AppError('Invalid or expired access token', 401);
  }
};

// Issues a fresh access token + refresh token pair for a user, persisting
// the refresh token (hashed) so it can be looked up, revoked, or rotated.
const issueTokenPair = async (user, context = {}) => {
  const accessToken = signAccessToken(user);
  const rawRefreshToken = generateRawToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + ms(env.jwtRefreshExpiresIn)),
      userAgent: context.userAgent || null,
      ipAddress: context.ipAddress || null,
    },
  });

  return { accessToken, refreshToken: rawRefreshToken };
};

// Validates a raw refresh token against the stored hash, rotates it (the
// old row is marked revoked and linked to its replacement), and returns a
// new token pair. Reuse of an already-revoked token revokes every
// outstanding refresh token for that user, since it's a signal the token
// may have leaked.
const rotateRefreshToken = async (rawRefreshToken, context = {}) => {
  const tokenHash = hashToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError('Refresh token has already been used', 401);
  }

  if (existing.expiresAt < new Date()) {
    throw new AppError('Refresh token expired', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || !user.isActive) {
    throw new AppError('Account is not active', 401);
  }

  const accessToken = signAccessToken(user);
  const rawNewRefreshToken = generateRawToken();

  const newToken = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawNewRefreshToken),
      expiresAt: new Date(Date.now() + ms(env.jwtRefreshExpiresIn)),
      userAgent: context.userAgent || null,
      ipAddress: context.ipAddress || null,
    },
  });

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
  });

  return { user, accessToken, refreshToken: rawNewRefreshToken };
};

const revokeRefreshToken = async (rawRefreshToken) => {
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

const revokeAllUserRefreshTokens = async (userId) => {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
};
