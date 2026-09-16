const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { generateTempPassword } = require('../utils/secureToken');
const mailService = require('./mailService');
const auditService = require('./auditService');
const { USER_SUMMARY_SELECT } = require('../utils/prismaSelects');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

// Embeds the driver's current active assignment (if any) so list/detail
// responses can show "assigned vehicle" per the product spec (§13)
// without a separate round trip. Flattened to `assignedVehicle` by
// `withAssignedVehicle` below rather than left as a 0-or-1-item array.
const ACTIVE_ASSIGNMENT_INCLUDE = {
  assignments: { where: { isActive: true }, take: 1, include: { vehicle: true } },
};

const withAssignedVehicle = (driver) => {
  const { assignments, ...rest } = driver;
  return { ...rest, assignedVehicle: assignments?.[0]?.vehicle ?? null };
};

const withDuplicateHandling = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err.code === UNIQUE_CONSTRAINT_ERROR) {
      const target = err.meta?.target || '';
      if (String(target).includes('email')) {
        throw new AppError('Email is already registered', 409);
      }
      throw new AppError('A driver with this license number already exists', 409);
    }
    throw err;
  }
};

const list = async (requestingUser, query) => {
  const { page, limit, search, status, organizationId } = query;

  const where = {
    organizationId: requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId,
    ...(status && { status }),
    ...(search && {
      OR: [
        { licenseNumber: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.driver.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SUMMARY_SELECT }, ...ACTIVE_ASSIGNMENT_INCLUDE },
    }),
    prisma.driver.count({ where }),
  ]);

  return {
    drivers: items.map(withAssignedVehicle),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getOne = async (requestingUser, driverId) => {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: { user: { select: USER_SUMMARY_SELECT }, ...ACTIVE_ASSIGNMENT_INCLUDE },
  });
  if (!driver) throw new AppError('Driver not found', 404);
  assertInScope(requestingUser, driver.organizationId, 'Driver not found');
  return withAssignedVehicle(driver);
};

const getByUserId = async (userId) => {
  const driver = await prisma.driver.findUnique({
    where: { userId },
    include: { user: { select: USER_SUMMARY_SELECT }, ...ACTIVE_ASSIGNMENT_INCLUDE },
  });
  if (!driver) throw new AppError('Driver profile not found', 404);
  return withAssignedVehicle(driver);
};

// Creates the User (role DRIVER, server-generated temp password emailed to
// them — same pattern as userService.create) and the Driver profile
// together in one transaction, since a Driver can't exist without a User
// and the product's "add a driver" flow is a single form.
const create = async (requestingUser, data, context = {}) => {
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

  const driver = await withDuplicateHandling(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: 'DRIVER',
          passwordHash,
        },
      });

      return tx.driver.create({
        data: {
          userId: user.id,
          organizationId,
          licenseNumber: data.licenseNumber,
          licenseType: data.licenseType,
          licenseExpiry: data.licenseExpiry,
          emergencyContact: data.emergencyContact,
          joiningDate: data.joiningDate,
        },
        include: { user: { select: USER_SUMMARY_SELECT } },
      });
    })
  );

  await mailService.sendWelcomeEmail(driver.user.email, tempPassword);
  await auditService.log(requestingUser.id, 'CREATE_DRIVER', 'Driver', driver.id, context, {
    licenseNumber: driver.licenseNumber,
  });

  return driver;
};

const update = async (requestingUser, driverId, data, context = {}) => {
  const existing = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!existing) throw new AppError('Driver not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Driver not found');

  const updated = await withDuplicateHandling(() =>
    prisma.driver.update({
      where: { id: driverId },
      data,
      include: { user: { select: USER_SUMMARY_SELECT } },
    })
  );

  await auditService.log(requestingUser.id, 'UPDATE_DRIVER', 'Driver', driverId, context, data);
  return updated;
};

const updateOwnProfile = async (userId, data) => {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw new AppError('Driver profile not found', 404);

  return prisma.driver.update({
    where: { userId },
    data,
    include: { user: { select: USER_SUMMARY_SELECT } },
  });
};

// Soft delete: marks the Driver INACTIVE and locks the linked User out
// (isActive: false, all refresh tokens revoked) in one transaction, so
// "deactivate a driver" fully removes their access rather than leaving a
// login that can't do anything useful. Never a hard delete — Driver rows
// are referenced by trip/assignment/issue history (Restrict on delete).
const deactivate = async (requestingUser, driverId, context = {}) => {
  const existing = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!existing) throw new AppError('Driver not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Driver not found');

  if (existing.userId === requestingUser.id) {
    throw new AppError('You cannot deactivate your own account', 400);
  }

  const [, , updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: existing.userId }, data: { isActive: false } }),
    prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: { status: 'INACTIVE' },
      include: { user: { select: USER_SUMMARY_SELECT } },
    }),
  ]);

  await auditService.log(requestingUser.id, 'DEACTIVATE_DRIVER', 'Driver', driverId, context);
  return updated;
};

module.exports = { list, getOne, getByUserId, create, update, updateOwnProfile, deactivate };
