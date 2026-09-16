const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { sanitizeUser } = require('./authService');
const { generateTempPassword } = require('../utils/secureToken');
const mailService = require('./mailService');
const tokenService = require('./tokenService');
const auditService = require('./auditService');
const { assertInScope } = require('../utils/scope');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

// Prevents a non-SUPER_ADMIN from creating or promoting another user to
// SUPER_ADMIN — a privilege-escalation guard the client can't be trusted
// to enforce.
const assertCanAssignRole = (requestingUser, role) => {
  if (role === 'SUPER_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
    throw new AppError('Only a super admin can assign the super admin role', 403);
  }
};

const getById = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  return sanitizeUser(user);
};

const list = async (requestingUser, query) => {
  const { page, limit, search, role, isActive, organizationId } = query;

  const where = {
    organizationId: requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId,
    ...(role && { role }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: items.map(sanitizeUser),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getOne = async (requestingUser, targetId) => {
  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw new AppError('User not found', 404);
  assertInScope(requestingUser, user.organizationId, 'User not found');
  return sanitizeUser(user);
};

// Invite flow: creates a user with a server-generated temporary password,
// emailed to them — the inviting admin never sees or sets it themselves.
const create = async (requestingUser, data, context = {}) => {
  assertCanAssignRole(requestingUser, data.role);

  const organizationId =
    requestingUser.role === 'SUPER_ADMIN' && data.organizationId
      ? data.organizationId
      : requestingUser.organizationId;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      organizationId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      passwordHash,
    },
  });

  await mailService.sendWelcomeEmail(user.email, tempPassword);
  await auditService.log(requestingUser.id, 'CREATE_USER', 'User', user.id, context, { role: user.role });

  return sanitizeUser(user);
};

const update = async (requestingUser, targetId, data, context = {}) => {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new AppError('User not found', 404);
  assertInScope(requestingUser, target.organizationId, 'User not found');

  if (data.role) assertCanAssignRole(requestingUser, data.role);

  if (targetId === requestingUser.id && data.isActive === false) {
    throw new AppError('You cannot deactivate your own account', 400);
  }

  const updated = await prisma.user.update({ where: { id: targetId }, data });

  if (data.isActive === false) {
    await tokenService.revokeAllUserRefreshTokens(targetId);
  }

  await auditService.log(requestingUser.id, 'UPDATE_USER', 'User', targetId, context, data);
  return sanitizeUser(updated);
};

const updateOwnProfile = async (userId, data) => {
  const updated = await prisma.user.update({ where: { id: userId }, data });
  return sanitizeUser(updated);
};

// Registers the Expo push token for the device currently signed in —
// single-device MVP scope (a later login on a different device just
// overwrites it, same as most single-token push setups).
const updatePushToken = async (userId, pushToken) => {
  await prisma.user.update({ where: { id: userId }, data: { pushToken } });
};

// Soft delete only — users (and drivers in particular) are referenced by
// historical records (trips, fuel, maintenance, audit logs) that must
// survive; see docs/database.md for the Restrict-vs-Cascade rationale.
const deactivate = async (requestingUser, targetId, context = {}) => {
  if (targetId === requestingUser.id) {
    throw new AppError('You cannot deactivate your own account', 400);
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new AppError('User not found', 404);
  assertInScope(requestingUser, target.organizationId, 'User not found');

  const updated = await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });
  await tokenService.revokeAllUserRefreshTokens(targetId);
  await auditService.log(requestingUser.id, 'DEACTIVATE_USER', 'User', targetId, context);

  return sanitizeUser(updated);
};

module.exports = { getById, list, getOne, create, update, updateOwnProfile, updatePushToken, deactivate };
