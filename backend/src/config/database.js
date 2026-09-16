const { PrismaClient } = require('@prisma/client');

// Reuse a single PrismaClient across hot reloads in dev, and across the
// whole process in production, instead of opening a new connection pool
// per import.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
