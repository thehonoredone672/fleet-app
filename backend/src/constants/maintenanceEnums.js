// Mirrors the Prisma Maintenance-related enums.
const MAINTENANCE_TYPES = [
  'ENGINE',
  'OIL',
  'TIRES',
  'BRAKES',
  'BATTERY',
  'AC',
  'ELECTRICAL',
  'GENERAL_SERVICE',
  'OTHER',
];
const MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

module.exports = { MAINTENANCE_TYPES, MAINTENANCE_STATUSES };
