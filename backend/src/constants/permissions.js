// Role → resource → allowed actions. This is the single source of truth
// for "who can do what" — the `authorize` middleware checks against it on
// every route, so permissions are never enforced by the client alone.
//
// `users` (Phase 4), `vehicles` (Phase 5), `drivers` (Phase 6),
// `assignments` (Phase 7), `trips` (Phase 8), `maintenance` (Phase 11),
// `fuel` (Phase 12), `expenses` (Phase 13), `documents` (Phase 14),
// `alerts` (Phase 15), `geofences` (Phase 17), and `reports` (Phase 18)
// are populated so far. Each later phase adds its own resource entry
// here as it builds that resource's routes, rather than speculatively
// filling in resources with no routes yet.
//
// Role capabilities per the product spec (§5):
//   SUPER_ADMIN    — manage everything, across all organizations
//   FLEET_ADMIN    — full management within their own organization
//   FLEET_MANAGER  — monitor fleet + manage daily operations (no user mgmt,
//                    no changing fleet composition — i.e. can update a
//                    vehicle's operational fields but not create/retire one)
//   DRIVER         — operates their own assignments only, no admin actions.
//                    Read access to their own assigned vehicle/profile is
//                    via ownership routes (GET /vehicles/me, /drivers/me),
//                    never this blanket grant.
//   VIEWER         — read-only
const PERMISSIONS = {
  SUPER_ADMIN: {
    users: ['create', 'read', 'update', 'delete'],
    vehicles: ['create', 'read', 'update', 'delete'],
    drivers: ['create', 'read', 'update', 'delete'],
    assignments: ['create', 'read', 'update'],
    trips: ['create', 'read', 'update'],
    maintenance: ['create', 'read', 'update'],
    fuel: ['read', 'update'],
    expenses: ['create', 'read', 'update', 'approve'],
    documents: ['create', 'read', 'update', 'delete'],
    alerts: ['read', 'resolve'],
    geofences: ['create', 'read', 'update', 'delete'],
    reports: ['read'],
  },
  FLEET_ADMIN: {
    users: ['create', 'read', 'update', 'delete'],
    vehicles: ['create', 'read', 'update', 'delete'],
    drivers: ['create', 'read', 'update', 'delete'],
    assignments: ['create', 'read', 'update'],
    trips: ['create', 'read', 'update'],
    maintenance: ['create', 'read', 'update'],
    fuel: ['read', 'update'],
    expenses: ['create', 'read', 'update', 'approve'],
    documents: ['create', 'read', 'update', 'delete'],
    alerts: ['read', 'resolve'],
    geofences: ['create', 'read', 'update', 'delete'],
    reports: ['read'],
  },
  FLEET_MANAGER: {
    users: ['read'],
    vehicles: ['read', 'update'],
    drivers: ['read', 'update'],
    // Assigning/unassigning drivers to vehicles is exactly the kind of
    // day-to-day operational task FLEET_MANAGER is meant to handle.
    assignments: ['create', 'read', 'update'],
    trips: ['create', 'read', 'update'],
    // Scheduling and updating service records (including cancelling one
    // via a status update) is routine fleet-ops work, same tier as trips.
    maintenance: ['create', 'read', 'update'],
    fuel: ['read', 'update'],
    // No `approve` — a FLEET_MANAGER can propose/edit an expense, but
    // sign-off needs an admin-tier role, same hierarchy reasoning as
    // vehicle retirement being admin-only rather than manager-level.
    expenses: ['create', 'read', 'update'],
    documents: ['create', 'read', 'update', 'delete'],
    // Acknowledging/resolving day-to-day alerts (expiry reminders,
    // maintenance due, an offline vehicle) is routine ops work — same
    // tier as everything else FLEET_MANAGER handles.
    alerts: ['read', 'resolve'],
    // Read/update (toggle isActive, adjust radius) but not create/delete
    // — geofences are semi-permanent fleet configuration, same tier
    // reasoning as vehicle create/retire being admin-only.
    geofences: ['read', 'update'],
    reports: ['read'],
  },
  DRIVER: {
    users: [],
    vehicles: [],
    // A driver's access to their *own* profile is a `/drivers/me`
    // ownership route, not this blanket grant — see driverRoutes.js.
    drivers: [],
    assignments: [],
    // Likewise: a driver's own trips are `/trips/me`, and
    // start/pause/resume/end are ownership-checked in tripService (the
    // assigned driver, or an override role) rather than gated by this
    // matrix at all — see tripRoutes.js.
    trips: [],
    maintenance: [],
    // A driver *submits* fuel records (POST /fuel) and can *read their
    // own* (e.g. the mobile Driver Home fuel summary), but both are
    // ownership-gated in fuelService, not this matrix grant — and they
    // still can't edit a record after submitting it (§19 Phase 19 added
    // the read access; editing stays admin-only, preventing after-the-
    // fact tampering with cost data).
    fuel: [],
    // Likewise: a driver can submit an expense claim for their own
    // assigned vehicle (POST /expenses is ownership-gated, same pattern
    // as fuel), but has no matrix-level access to read/edit/approve.
    expenses: [],
    // A driver can create/read/update/delete documents linked to their
    // *own* Driver record (ownership-gated, checked in documentService)
    // but has no matrix-level grant — they can't touch vehicle documents
    // at all, those are admin-managed.
    documents: [],
    // Alerts are a manager-facing resource — a driver doesn't see the
    // fleet's expiry/maintenance/offline alerts even when one happens to
    // reference them (e.g. their own LICENSE_EXPIRY).
    alerts: [],
    geofences: [],
    reports: [],
  },
  VIEWER: {
    users: ['read'],
    vehicles: ['read'],
    drivers: ['read'],
    assignments: ['read'],
    trips: ['read'],
    maintenance: ['read'],
    fuel: ['read'],
    expenses: ['read'],
    documents: ['read'],
    alerts: ['read'],
    geofences: ['read'],
    reports: ['read'],
  },
};

const can = (role, resource, action) => Boolean(PERMISSIONS[role]?.[resource]?.includes(action));

module.exports = { PERMISSIONS, can };
