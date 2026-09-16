const AppError = require('./AppError');

// A non-SUPER_ADMIN caller is always confined to their own organization.
// Returns 404 (not 403) for out-of-scope records so cross-org existence
// isn't leaked to the caller.
const assertInScope = (requestingUser, targetOrganizationId, message = 'Resource not found') => {
  if (requestingUser.role === 'SUPER_ADMIN') return;
  if (requestingUser.organizationId !== targetOrganizationId) {
    throw new AppError(message, 404);
  }
};

module.exports = { assertInScope };
