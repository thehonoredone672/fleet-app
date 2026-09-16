const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { generateRawToken, hashToken } = require('../utils/secureToken');
const tokenService = require('./tokenService');
const mailService = require('./mailService');
const auditService = require('./auditService');

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const sanitizeUser = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

// Self-service signup: creates a new Organization and its first user as
// FLEET_ADMIN. SUPER_ADMIN is a platform-level role, not exposed here —
// it's provisioned directly (see prisma/seed.js). Adding further users to
// an existing organization is a separate, invite-style flow (Phase 4).
const register = async ({ organizationName, name, email, phone, password }, context = {}) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName, email },
    });

    return tx.user.create({
      data: {
        organizationId: organization.id,
        name,
        email,
        phone,
        passwordHash,
        role: 'FLEET_ADMIN',
      },
    });
  });

  const tokens = await tokenService.issueTokenPair(user, context);
  await auditService.log(user.id, 'REGISTER', 'User', user.id, context);

  return { user: sanitizeUser(user), ...tokens };
};

const login = async ({ email, password }, context = {}) => {
  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic error whether the email doesn't exist or the password is
  // wrong — avoids leaking which emails are registered.
  const invalidCredentials = () => new AppError('Invalid email or password', 401);

  if (!user) throw invalidCredentials();
  if (!user.isActive) throw new AppError('Account is deactivated', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw invalidCredentials();

  const tokens = await tokenService.issueTokenPair(user, context);
  await auditService.log(user.id, 'LOGIN', 'User', user.id, context);

  return { user: sanitizeUser(user), ...tokens };
};

const refresh = async (refreshToken, context = {}) => {
  const { user, accessToken, refreshToken: newRefreshToken } = await tokenService.rotateRefreshToken(
    refreshToken,
    context
  );
  return { user: sanitizeUser(user), accessToken, refreshToken: newRefreshToken };
};

const logout = async (refreshToken) => {
  await tokenService.revokeRefreshToken(refreshToken);
};

const changePassword = async (userId, currentPassword, newPassword, context = {}) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 400);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await tokenService.revokeAllUserRefreshTokens(userId);
  await auditService.log(userId, 'CHANGE_PASSWORD', 'User', userId, context);
};

// Always resolves the same way regardless of whether the email exists, so
// the API response can't be used to enumerate registered accounts.
const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const rawToken = generateRawToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await mailService.sendPasswordResetEmail(user.email, rawToken);
};

const resetPassword = async (rawToken, newPassword, context = {}) => {
  const tokenHash = hashToken(rawToken);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  await tokenService.revokeAllUserRefreshTokens(resetToken.userId);
  await auditService.log(resetToken.userId, 'RESET_PASSWORD', 'User', resetToken.userId, context);
};

module.exports = {
  sanitizeUser,
  register,
  login,
  refresh,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
};
