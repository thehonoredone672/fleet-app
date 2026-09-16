const AppError = require('../utils/AppError');
const { can } = require('../constants/permissions');

// Must run after `authenticate`. Checks only role-level capability
// ("can a FLEET_MANAGER read users at all?") — organization-scoping and
// per-record ownership ("but only within their own org", "but not
// themselves") are enforced in the service layer, since those checks need
// the specific record being acted on, not just the route.
const authorize = (resource, action) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }
  if (!can(req.user.role, resource, action)) {
    return next(new AppError('You do not have permission to perform this action', 403));
  }
  next();
};

module.exports = authorize;
