// Mirrors the Prisma DriverStatus enum. `licenseType` is deliberately left
// as free text in the schema (license classes vary widely by
// jurisdiction — Class A/B, CDL, LMV/HMV, etc.), so there's no enum for it.
const DRIVER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE'];

module.exports = { DRIVER_STATUSES };
