// Mirrors the Prisma `Role` enum — kept here as plain JS so it can be
// reused in Zod schemas and the permission matrix without importing the
// generated Prisma client into validator code.
const ROLES = ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER', 'DRIVER', 'VIEWER'];

module.exports = { ROLES };
