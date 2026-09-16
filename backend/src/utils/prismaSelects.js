// Shared Prisma `select`/`include` fragments used across services whenever
// a User needs to be embedded in another resource's response — keeps
// passwordHash (and other sensitive fields) out of the query itself
// rather than relying on every call site to remember to strip it.
const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  profileImage: true,
  isActive: true,
};

module.exports = { USER_SUMMARY_SELECT };
