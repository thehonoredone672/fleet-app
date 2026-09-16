const { PrismaClient } = require('@prisma/client');

// Sanity check on the generated client's shape — doesn't touch a real
// database, just confirms every model from the product spec made it into
// the schema and Prisma generated a delegate for it.
describe('Prisma schema', () => {
  const prisma = new PrismaClient();

  const expectedModels = [
    'organization',
    'user',
    'refreshToken',
    'vehicle',
    'driver',
    'vehicleAssignment',
    'trip',
    'location',
    'maintenance',
    'fuelRecord',
    'expense',
    'document',
    'alert',
    'notification',
    'geofence',
    'geofenceEvent',
    'issueReport',
    'auditLog',
  ];

  test.each(expectedModels)('exposes a %s delegate', (modelName) => {
    expect(prisma[modelName]).toBeDefined();
    expect(typeof prisma[modelName].findMany).toBe('function');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
