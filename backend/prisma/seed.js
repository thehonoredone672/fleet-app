const bcrypt = require('bcryptjs');
const prisma = require('../src/config/database');

const DEMO_ADMIN_EMAIL = 'admin@demofleet.test';
const DEMO_ADMIN_PASSWORD = 'ChangeMe123!';

async function main() {
  const organization = await prisma.organization.upsert({
    where: { email: 'ops@demofleet.test' },
    update: {},
    create: {
      name: 'Demo Fleet Co',
      email: 'ops@demofleet.test',
      phone: '+1-555-0100',
      address: '123 Logistics Way, Warehouse District',
      subscriptionPlan: 'PRO',
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Demo Super Admin',
      email: DEMO_ADMIN_EMAIL,
      phone: '+1-555-0101',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log('Seeded organization:', organization.name);
  console.log('Seeded admin user:', admin.email, '(password: ChangeMe123!)');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
