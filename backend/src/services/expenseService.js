const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { assertInScope } = require('../utils/scope');
const { can } = require('../constants/permissions');
const { requireActiveAssignmentForDriver } = require('./assignmentService');
const auditService = require('./auditService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const list = async (requestingUser, query) => {
  const { page, limit, vehicleId, category, status, dateFrom, dateTo, organizationId } = query;
  const scopeOrgId = requestingUser.role === 'SUPER_ADMIN' ? organizationId : requestingUser.organizationId;

  const where = {
    ...(scopeOrgId && { vehicle: { organizationId: scopeOrgId } }),
    ...(vehicleId && { vehicleId }),
    ...(category && { category }),
    ...(status && { status }),
    ...((dateFrom || dateTo) && { date: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }),
  };

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { vehicle: true },
    }),
    prisma.expense.count({ where }),
  ]);

  return { expenses: items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const getOne = async (requestingUser, expenseId) => {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId }, include: { vehicle: true } });
  if (!expense) throw new AppError('Expense not found', 404);
  assertInScope(requestingUser, expense.vehicle.organizationId, 'Expense not found');
  return expense;
};

// Two ways to reach this: a driver submitting a claim for their own
// actively-assigned vehicle (ownership-gated, same pattern as fuel/
// location — vehicleId is cross-checked, never blindly trusted), or an
// admin-tier role (`expenses:create`) entering one directly for any
// vehicle in their org. Either way the record starts PENDING — even an
// admin's own entry goes through the same approval step, so there's one
// consistent audit trail rather than a special-cased auto-approve path.
const create = async (requestingUser, data, context = {}) => {
  let vehicle;

  if (requestingUser.role === 'DRIVER') {
    const { assignment } = await requireActiveAssignmentForDriver(requestingUser);
    if (data.vehicleId !== assignment.vehicleId) {
      throw new AppError('vehicleId does not match your currently assigned vehicle', 403);
    }
    vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
  } else if (can(requestingUser.role, 'expenses', 'create')) {
    vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle) throw new AppError('Vehicle not found', 404);
    assertInScope(requestingUser, vehicle.organizationId, 'Vehicle not found');
  } else {
    throw new AppError('You do not have permission to perform this action', 403);
  }

  const expense = await prisma.expense.create({
    data: {
      vehicleId: vehicle.id,
      category: data.category,
      amount: data.amount,
      description: data.description,
      date: data.date || new Date(),
      receiptUrl: data.receiptUrl,
      status: 'PENDING',
      createdById: requestingUser.id,
    },
    include: { vehicle: true },
  });

  await auditService.log(requestingUser.id, 'CREATE_EXPENSE', 'Expense', expense.id, context, {
    vehicleId: vehicle.id,
    amount: expense.amount,
  });

  return expense;
};

const update = async (requestingUser, expenseId, data, context = {}) => {
  const existing = await prisma.expense.findUnique({ where: { id: expenseId }, include: { vehicle: true } });
  if (!existing) throw new AppError('Expense not found', 404);
  assertInScope(requestingUser, existing.vehicle.organizationId, 'Expense not found');

  if (existing.status !== 'PENDING') {
    throw new AppError(`Cannot update an expense that is already ${existing.status}`, 400);
  }

  const updated = await prisma.expense.update({ where: { id: expenseId }, data, include: { vehicle: true } });
  await auditService.log(requestingUser.id, 'UPDATE_EXPENSE', 'Expense', expenseId, context, data);
  return updated;
};

const setDecision = async (requestingUser, expenseId, decision, context = {}) => {
  const existing = await prisma.expense.findUnique({ where: { id: expenseId }, include: { vehicle: true } });
  if (!existing) throw new AppError('Expense not found', 404);
  assertInScope(requestingUser, existing.vehicle.organizationId, 'Expense not found');

  if (existing.status !== 'PENDING') {
    throw new AppError(`Cannot ${decision === 'APPROVED' ? 'approve' : 'reject'} an expense that is already ${existing.status}`, 400);
  }

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: { status: decision, approvedById: requestingUser.id, approvedAt: new Date() },
    include: { vehicle: true },
  });

  await auditService.log(
    requestingUser.id,
    decision === 'APPROVED' ? 'APPROVE_EXPENSE' : 'REJECT_EXPENSE',
    'Expense',
    expenseId,
    context
  );

  await notificationService
    .notify(existing.createdById, {
      title: decision === 'APPROVED' ? 'Expense approved' : 'Expense rejected',
      message: `Your ${existing.category.toLowerCase()} expense of ${existing.amount} was ${decision.toLowerCase()}`,
      type: decision === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
    })
    .catch((err) => logger.error('Failed to send notification', { message: err.message }));

  return updated;
};

const approve = (requestingUser, expenseId, context) => setDecision(requestingUser, expenseId, 'APPROVED', context);
const reject = (requestingUser, expenseId, context) => setDecision(requestingUser, expenseId, 'REJECTED', context);

module.exports = { list, getOne, create, update, approve, reject };
