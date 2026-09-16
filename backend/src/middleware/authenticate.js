const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const tokenService = require('../services/tokenService');

// Verifies the JWT, then re-fetches the user from the database rather than
// trusting the token's claims — so a deactivated account or changed role
// takes effect immediately instead of waiting for the access token to
// expire. Role-based permission checks live in a separate `authorize`
// middleware (Phase 4); this only establishes identity.
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Authentication required', 401);
  }

  const payload = tokenService.verifyAccessToken(token);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError('User no longer exists', 401);
  }
  if (!user.isActive) {
    throw new AppError('Account is deactivated', 401);
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };

  next();
});

module.exports = authenticate;
