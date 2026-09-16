// Mirrors the Prisma Vehicle-related enums — plain JS so validators don't
// need to import the generated Prisma client (see constants/roles.js for
// the same pattern).
const VEHICLE_TYPES = ['TRUCK', 'VAN', 'CAR', 'BUS', 'MOTORCYCLE', 'TRAILER', 'OTHER'];
const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'OTHER'];
const VEHICLE_STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE', 'RETIRED'];

module.exports = { VEHICLE_TYPES, FUEL_TYPES, VEHICLE_STATUSES };
