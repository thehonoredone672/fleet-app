const prisma = require('../config/database');

const log = (userId, action, entity, entityId, context = {}, metadata) =>
  prisma.auditLog.create({
    data: { userId, action, entity, entityId, ipAddress: context.ipAddress || null, metadata },
  });

module.exports = { log };
