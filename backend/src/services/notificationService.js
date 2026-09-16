const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const pushService = require('./pushService');

// Creates the in-app Notification row (source of truth) and best-effort
// fires a push on top of it — a failed/skipped push never blocks the
// notification from existing. Called by other services (trip, expense,
// alert generation), never directly by a route.
const notify = async (userId, { title, message, type = 'GENERAL' }) => {
  const [user, notification] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true, isActive: true } }),
    prisma.notification.create({ data: { userId, title, message, type } }),
  ]);

  if (user?.isActive && user.pushToken) {
    // Not awaited into the caller's critical path — push delivery is a
    // side effect, not something a trip/expense/alert write should wait
    // on or fail because of.
    pushService.sendPush(user.pushToken, { title, message, data: { type } }).catch(() => {});
  }

  return notification;
};

const notifyMany = async (userIds, { title, message, type = 'GENERAL' }) => {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return;

  await prisma.notification.createMany({ data: uniqueIds.map((userId) => ({ userId, title, message, type })) });

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, isActive: true, pushToken: { not: null } },
    select: { pushToken: true },
  });
  await Promise.allSettled(
    users.map((u) => pushService.sendPush(u.pushToken, { title, message, data: { type } }))
  );
};

// Fans a notification out to every admin-tier user (the roles that can
// act on alerts/expenses/etc.) in an organization — used by the
// background alert jobs and the fuel-anomaly heuristic, neither of which
// has a single "requesting user" to notify.
const notifyOrgManagers = async (organizationId, payload) => {
  const managers = await prisma.user.findMany({
    where: { organizationId, isActive: true, role: { in: ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER'] } },
    select: { id: true },
  });
  await notifyMany(managers.map((m) => m.id), payload);
};

const list = async (requestingUser, query) => {
  const { page, limit, isRead, type } = query;
  const where = { userId: requestingUser.id, ...(isRead !== undefined && { isRead }), ...(type && { type }) };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: requestingUser.id, isRead: false } }),
  ]);

  return {
    notifications: items,
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const markRead = async (requestingUser, notificationId) => {
  const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!existing || existing.userId !== requestingUser.id) {
    throw new AppError('Notification not found', 404);
  }
  if (existing.isRead) return existing;

  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
};

const markAllRead = async (requestingUser) => {
  const result = await prisma.notification.updateMany({
    where: { userId: requestingUser.id, isRead: false },
    data: { isRead: true },
  });
  return result.count;
};

module.exports = { notify, notifyMany, notifyOrgManagers, list, markRead, markAllRead };
