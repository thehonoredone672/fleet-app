const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const auditService = require('./auditService');

const list = async (requestingUser, query) => {
  const { page, limit, type, severity, isResolved, vehicleId, driverId, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const where = {
    ...(scopeOrgId && { organizationId: scopeOrgId }),
    ...(type && { type }),
    ...(severity && { severity }),
    ...(isResolved !== undefined && { isResolved }),
    ...(vehicleId && { vehicleId }),
    ...(driverId && { driverId }),
  };

  const [items, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ isResolved: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
      include: { vehicle: true, driver: true },
    }),
    prisma.alert.count({ where }),
  ]);

  return { alerts: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const getOne = async (requestingUser, alertId) => {
  const alert = await prisma.alert.findUnique({ where: { id: alertId }, include: { vehicle: true, driver: true } });
  if (!alert) throw new AppError('Alert not found', 404);
  assertInScope(requestingUser, alert.organizationId, 'Alert not found');
  return alert;
};

const resolve = async (requestingUser, alertId, context = {}) => {
  const existing = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!existing) throw new AppError('Alert not found', 404);
  assertInScope(requestingUser, existing.organizationId, 'Alert not found');

  if (existing.isResolved) {
    throw new AppError('Alert is already resolved', 400);
  }

  const updated = await prisma.alert.update({
    where: { id: alertId },
    data: { isResolved: true, resolvedById: requestingUser.id, resolvedAt: new Date() },
    include: { vehicle: true, driver: true },
  });

  await auditService.log(requestingUser.id, 'RESOLVE_ALERT', 'Alert', alertId, context);
  return updated;
};

module.exports = { list, getOne, resolve };
