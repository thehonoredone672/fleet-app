# API Reference

Base URL: `/api/v1`. All responses use a consistent envelope:

```json
{ "success": true, "data": { } }
```
```json
{ "success": false, "message": "...", "errors": [] }
```

Validation failures return `422` with `errors` as `[{ field, message }]`.

## Auth — `/api/v1/auth`

### POST `/auth/register`
Self-service signup. Creates a **new Organization** and its first user as `FLEET_ADMIN`. (`SUPER_ADMIN` is a platform-level role, not available via self-serve signup — see `prisma/seed.js`.)

Request:
```json
{
  "organizationName": "Acme Logistics",
  "name": "Jane Doe",
  "email": "jane@acme.com",
  "phone": "+1-555-0100",
  "password": "Passw0rd"
}
```
Password must be 8+ characters with at least one uppercase, one lowercase, and one digit.

Response `201`:
```json
{ "success": true, "data": { "user": { "id", "name", "email", "role": "FLEET_ADMIN", "organizationId", ... }, "accessToken", "refreshToken" } }
```
`409` if the email is already registered.

Rate limited: 20 requests / 15 min / IP.

### POST `/auth/login`
```json
{ "email": "jane@acme.com", "password": "Passw0rd" }
```
Response `200`: same shape as register. `401` with a generic "Invalid email or password" message for either a wrong password or an unknown email — the two cases are indistinguishable by design, to avoid leaking which emails are registered.

Rate limited: 20 requests / 15 min / IP.

### POST `/auth/refresh`
```json
{ "refreshToken": "<raw token>" }
```
Rotates the refresh token: the old one is immediately revoked and cannot be reused (reuse of an already-revoked token revokes **every** outstanding refresh token for that user, since it signals possible token theft). Response `200` returns a new `{ user, accessToken, refreshToken }`. `401` if invalid, expired, or already used.

### POST `/auth/logout`
```json
{ "refreshToken": "<raw token>" }
```
Revokes the given refresh token. Idempotent — always `200`, even if the token was already revoked or unknown.

### POST `/auth/forgot-password`
```json
{ "email": "jane@acme.com" }
```
Always responds `200` with a generic message regardless of whether the email exists, to prevent account enumeration. If the user exists, a reset link (valid 15 minutes) is emailed via `mailService` — see [security.md](security.md#password-reset).

### POST `/auth/reset-password`
```json
{ "token": "<raw token from email link>", "newPassword": "NewPass1" }
```
`400` if the token is invalid, expired, or already used. On success, all of the user's refresh tokens are revoked (forces re-login everywhere).

### POST `/auth/change-password` *(requires `Authorization: Bearer <accessToken>`)*
```json
{ "currentPassword": "Passw0rd", "newPassword": "NewPass1" }
```
`400` if `currentPassword` doesn't match. On success, all of the user's refresh tokens are revoked.

## Users — `/api/v1/users`

All routes below require `Authorization: Bearer <accessToken>`. RBAC and organization-scoping details: [security.md#rbac](security.md#rbac).

### GET `/users/me`
Returns the authenticated user's profile (used by the mobile app to restore a session on cold start, after reading the stored access token). `401` if the token is missing/invalid/expired, or the account has been deactivated since the token was issued (identity is re-verified against the database on every request, not just trusted from the JWT).

### PATCH `/users/me`
Self-service profile update — `name`, `phone`, `profileImage` only (no role/isActive/email). At least one field required.

### PATCH `/users/me/push-token`
```json
{ "pushToken": "ExponentPushToken[...]" }
```
Registers the Expo push token for the device currently signed in — single-device MVP scope; a later login elsewhere just overwrites it. See [Notifications](#notifications--apiv1notifications).

### GET `/users` *(requires `users:read`)*
List users, scoped to the caller's organization (a `SUPER_ADMIN` may pass `organizationId` to view a specific org, or omit it to see all).

Query: `page` (default 1), `limit` (default 20, max 100), `search` (matches name/email), `role`, `isActive`.

Response:
```json
{ "success": true, "data": { "users": [...], "pagination": { "page", "limit", "total", "totalPages" } } }
```

### POST `/users` *(requires `users:create`)*
Invites a new user into the caller's organization (a `SUPER_ADMIN` may pass `organizationId` to invite into a specific org). A secure temporary password is generated server-side and emailed to the invitee — never returned in the response or chosen by the inviting admin.
```json
{ "name": "New Driver", "email": "driver@acme.com", "phone": "+1-555-0102", "role": "DRIVER" }
```
`403` if attempting to assign `SUPER_ADMIN` as anyone other than a `SUPER_ADMIN`. `409` if the email is already registered.

Note: creating a user with `role: "DRIVER"` here only creates the login/identity record — the associated `Driver` profile (license number, license expiry, etc.) is created separately once Phase 6 (Driver management) lands.

### GET `/users/:id` *(requires `users:read`)*
`404` (not `403`) if the target user exists but is outside the caller's organization — cross-org existence is never leaked to a non-`SUPER_ADMIN` caller.

### PATCH `/users/:id` *(requires `users:update`)*
Any of `name`, `phone`, `profileImage`, `role`, `isActive`. Same cross-org `404`, same `SUPER_ADMIN`-only role-escalation guard as above. `400` if a user tries to set `isActive: false` on their own account. Setting `isActive: false` also revokes all of that user's refresh tokens.

### DELETE `/users/:id` *(requires `users:delete`)*
Soft delete — sets `isActive: false` and revokes all refresh tokens; the row is never hard-deleted (users, especially drivers, are referenced by historical trip/fuel/maintenance records). `400` if targeting your own account.

## Vehicles — `/api/v1/vehicles`

All routes require auth. RBAC: `SUPER_ADMIN`/`FLEET_ADMIN` have full CRUD; `FLEET_MANAGER` can read and update (not create/retire — that's a fleet-composition change, treated as an admin action); `VIEWER` is read-only; `DRIVER` has no blanket access (their own assigned vehicle becomes readable once `VehicleAssignment` lands in Phase 7). Org-scoped the same way as `/users` — cross-org access is `404`.

### GET `/vehicles` *(requires `vehicles:read`)*
Query: `page`, `limit` (max 100), `search` (registration/make/model), `status` (`ACTIVE`/`MAINTENANCE`/`INACTIVE`/`RETIRED`), `vehicleType`, `organizationId` (`SUPER_ADMIN` only).
```json
{ "success": true, "data": { "vehicles": [...], "pagination": { "page", "limit", "total", "totalPages" } } }
```
Each vehicle includes `assignedDriver` (the driver from its current active `VehicleAssignment`, or `null`) — see [Assignments](#assignments--apiv1assignments).

### POST `/vehicles` *(requires `vehicles:create`)*
```json
{
  "registrationNumber": "TN38AB1234",
  "vehicleType": "TRUCK",
  "make": "Tata",
  "model": "407",
  "year": 2022,
  "fuelType": "DIESEL",
  "capacity": 4,
  "insuranceExpiry": "2026-06-30"
}
```
`registrationNumber` is upper-cased automatically. `409` if it already exists within the same organization (uniqueness is per-org, not global — two different fleets can each have a "TN38AB1234"). New vehicles default to `status: "ACTIVE"`.

### GET `/vehicles/:id` *(requires `vehicles:read`)*
Includes `assignedDriver`, same as the list endpoint.

### GET `/vehicles/me`
Ownership route (no `vehicles` permission required, same pattern as `/drivers/me`): the vehicle currently assigned to the calling driver. `404 "No vehicle is currently assigned to you"` if none.

### PATCH `/vehicles/:id` *(requires `vehicles:update`)*
Any subset of the create fields, plus `status`. This is also how `FLEET_MANAGER` records day-to-day changes like `currentMileage` or setting `status: "MAINTENANCE"`.

### DELETE `/vehicles/:id` *(requires `vehicles:delete`)*
Soft delete — sets `status: "RETIRED"`, never removes the row (vehicles are referenced by trip/maintenance/fuel/expense/issue history). `400` if already retired.

## Drivers — `/api/v1/drivers`

All routes require auth. RBAC: `SUPER_ADMIN`/`FLEET_ADMIN` have full CRUD; `FLEET_MANAGER` can read and update (not create/deactivate — a roster change, treated as an admin action, same rationale as vehicles); `VIEWER` is read-only. A `DRIVER` has no blanket access to this resource — their own profile is reached via `/drivers/me` instead, an ownership route independent of the permission matrix. Org-scoped like `/users` and `/vehicles` — cross-org access is `404`.

### POST `/drivers` *(requires `drivers:create`)*
Creates the underlying **User** (role `DRIVER`, server-generated temp password emailed — same as `POST /users`) **and** the **Driver** profile together, in one transaction. This is a single onboarding call rather than the two-step "invite a DRIVER via `/users`, then attach a profile" — a fleet admin adding a driver fills in one form.
```json
{
  "name": "Arun Kumar",
  "email": "arun@acme.com",
  "phone": "+91-98765-43210",
  "licenseNumber": "TN-DL-0001234",
  "licenseType": "LMV",
  "licenseExpiry": "2028-01-01",
  "emergencyContact": "Priya, +91-98765-00000",
  "joiningDate": "2024-03-01"
}
```
`409` if the email is already registered, or if the license number already exists within the organization (unique per org, not global). New drivers default to `status: "ACTIVE"`.

A user invited with `role: "DRIVER"` via `POST /users` (Phase 4) still has **no** Driver profile until one is created here — `GET /drivers/me` for such a user returns `404 Driver profile not found`.

### GET `/drivers` *(requires `drivers:read`)*
Query: `page`, `limit`, `search` (license number, driver name, or email), `status`, `organizationId` (`SUPER_ADMIN` only). Each driver includes a `user` object (`id, name, email, phone, profileImage, isActive` — never `passwordHash`) and `assignedVehicle` (from its current active `VehicleAssignment`, or `null`) — see [Assignments](#assignments--apiv1assignments).

### GET `/drivers/:id` *(requires `drivers:read`)*

### PATCH `/drivers/:id` *(requires `drivers:update`)*
`licenseNumber`, `licenseType`, `licenseExpiry`, `emergencyContact`, `joiningDate`, `status`. To change the driver's name/phone/email, use `PATCH /users/:id` instead — Driver and User are updated through their own endpoints, not merged into one.

### DELETE `/drivers/:id` *(requires `drivers:delete`)*
Soft delete: sets `Driver.status: "INACTIVE"` **and** deactivates the linked User (`isActive: false`, all refresh tokens revoked) in one transaction — deactivating a driver fully locks them out, not just relabels their roster status. `400` if targeting your own account (only reachable by an admin acting on someone else, in practice, since a `DRIVER` role has no `drivers:delete` permission at all).

### GET `/drivers/me`
The caller's own Driver profile, including `assignedVehicle` (requires the caller to actually have a Driver profile — see the `404` note above).

### PATCH `/drivers/me`
Self-service update — `emergencyContact` **only**. License fields are intentionally not self-editable, so a driver can't sidestep an expiry check by editing their own record.

## Assignments — `/api/v1/assignments`

All routes require auth. RBAC: `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER` can create, read, and update (unassign) — assigning drivers to vehicles is treated as a day-to-day operational task, unlike creating/retiring the vehicle or driver records themselves. `VIEWER` is read-only. `DRIVER` has no access to this resource (they see the result via `GET /vehicles/me` / `GET /drivers/me`). There is no delete action — an assignment is never removed, only unassigned; its history stays queryable via `isActive: false`.

Business rules enforced on create (§48 of the product spec) — see `src/services/assignmentService.js`:
- A vehicle can have at most one **active** assignment at a time (`409` otherwise).
- A driver can have at most one **active** assignment at a time (`409` otherwise).
- The vehicle and driver must belong to the same organization (`400`).
- A `RETIRED` vehicle cannot be assigned (`400`).
- A driver whose `status` isn't `ACTIVE` cannot be assigned (`400`).

The app-level check above is a fast, clean-error-message guard. The actual race-safe guarantee is a partial unique index on `vehicle_assignments` — see [docs/database.md#manual-step-partial-unique-indexes](database.md#manual-step-partial-unique-indexes); apply that migration before relying on this in production.

### GET `/assignments` *(requires `assignments:read`)*
Query: `page`, `limit`, `vehicleId`, `driverId`, `isActive`, `organizationId` (`SUPER_ADMIN` only).

### POST `/assignments` *(requires `assignments:create`)*
```json
{ "vehicleId": "veh_123", "driverId": "drv_456" }
```

### GET `/assignments/:id` *(requires `assignments:read`)*

### PATCH `/assignments/:id/unassign` *(requires `assignments:update`)*
No body. Sets `isActive: false` and `unassignedAt`. `400` if the assignment is already inactive.

## Trips — `/api/v1/trips`

All routes require auth. RBAC: `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER` can create, read, and update/cancel trips (scheduling/dispatching is treated as a day-to-day operational task, same as assignments). `VIEWER` is read-only. `DRIVER` has no blanket access to this resource — see `/trips/me` and the start/pause/resume/end actions below.

### Trip state machine
```
SCHEDULED --start--> IN_PROGRESS --pause--> PAUSED --resume--> IN_PROGRESS --end--> COMPLETED
    |                    |                     |
    +---------cancel-----+---------cancel------+--> CANCELLED
```
`ASSIGNED` and `STARTED` exist in the `TripStatus` enum for schema completeness but are never actually reached — a trip always has its vehicle/driver set at creation, so a separate "assigned" state would be redundant, and "started" collapses straight into `IN_PROGRESS`. Any transition outside this diagram (e.g. starting a `COMPLETED` trip, ending a `CANCELLED` one) is rejected with `400 "Cannot <action> a trip that is <STATUS>"`. See `src/utils/tripStateMachine.js`.

### GET `/trips` *(requires `trips:read`)*
Query: `page`, `limit`, `status`, `driverId`, `vehicleId`, `dateFrom`/`dateTo` (filters on `scheduledAt`), `organizationId` (`SUPER_ADMIN` only).

### POST `/trips` *(requires `trips:create`)*
```json
{
  "vehicleId": "veh_123",
  "driverId": "drv_456",
  "source": "Warehouse",
  "destination": "Customer Site",
  "scheduledAt": "2026-01-15T09:00:00Z",
  "purpose": "DELIVERY"
}
```
Business rules enforced (§48) — all `400`: the vehicle can't be `RETIRED`; the driver's `status` must be `ACTIVE`; the driver's `licenseExpiry` must not be in the past. Vehicle and driver must share an organization; both must be within the caller's scope (`404` otherwise, same cross-org-hiding pattern as elsewhere).

### GET `/trips/:id` *(requires `trips:read`)*

### PATCH `/trips/:id` *(requires `trips:update`)*
`source`, `sourceLat/Lng`, `destination`, `destLat/Lng`, `scheduledAt`, `purpose`, `notes`. `400` unless the trip is still `SCHEDULED` — once a trip is under way its plan isn't edited, only its live state (see the action endpoints below).

### POST `/trips/:id/cancel` *(requires `trips:update`)*
Valid from `SCHEDULED`, `IN_PROGRESS`, or `PAUSED`.

### POST `/trips/:id/start`, `/pause`, `/resume`, `/end`
Driver actions (§9) — **not** gated by the `trips` permission above. Allowed for the specific driver assigned to the trip, or as a dispatcher override for `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER`. `403` for anyone else (including a different driver).
- `start` body (optional): `{ "startOdometer": 1000, "sourceLat", "sourceLng" }`. `400` if the vehicle's `status` isn't `ACTIVE` (e.g. `MAINTENANCE`).
- `end` body (optional): `{ "endOdometer": 1050, "destLat", "destLng" }`. If both odometer readings are present, `distance` is computed and the vehicle's `currentMileage` is bumped to the higher of the two (never lowered). `400` if `endOdometer < startOdometer`.
- Live GPS capture on these actions (continuous position tracking, not just a single reading) is wired up in Phase 9.

### GET `/trips/me`
Ownership route: the calling driver's own trips (same query params as `GET /trips` minus `driverId`/`vehicleId`/`organizationId`, which are implicit). `404 "Driver profile not found"` if the caller has no Driver profile.

## Location — `/api/v1/location` and `/api/v1/fleet`

Full design and rationale: [docs/gps-tracking.md](gps-tracking.md).

### POST `/api/v1/location`
Driver-only (role `DRIVER`, not gated by the permission matrix — see gps-tracking.md#authorization-model). Body is a single point **or** an array of up to 100:
```json
{ "vehicleId": "veh_123", "clientId": "uuid-optional", "latitude": 12.9, "longitude": 77.6, "speed": 8.3, "heading": 90, "accuracy": 5, "timestamp": "2026-01-15T09:00:00Z" }
```
`403` if `vehicleId` doesn't match the driver's active assignment, or if the caller isn't a driver. `400` if the driver has no active assignment at all. Response:
```json
{ "success": true, "data": { "accepted": 1, "latest": { ...point } } }
```
`accepted` may be less than the number of points sent — duplicates (matching `clientId`) are silently dropped, not errors.

### GET `/vehicles/:id/location` *(requires `vehicles:read`)*
The single most recent point for one vehicle. `404` if none recorded yet, or if the vehicle is out of the caller's org scope.

### GET `/fleet/live` *(requires `vehicles:read`)*
One row per non-retired vehicle in the caller's org (or a specific org, `SUPER_ADMIN` only, via `?organizationId=`), each with its most recent location (`null` if none yet):
```json
{ "success": true, "data": { "vehicles": [ { "id", "registrationNumber", "status", "location": { ... } | null } ] } }
```

### Socket.IO
Connect with a JWT access token: `io(url, { auth: { token: accessToken } })`. An invalid/missing/expired token, or a deactivated account, rejects the connection (`connect_error`) before any room is joined. Every authenticated connection joins `org:{organizationId}:fleet`.

- **Client → server**: `vehicle:location`, same payload shape as the REST single-point body (no `driverId` — always derived from the authenticated socket). Optional ack callback receives `{ success, data }` or `{ success: false, message }` — validation/business-rule failures never crash the connection.
- **Server → clients** (broadcast to the org's room): `vehicle:location`, the stored point — this is what the Live Map (Phase 10) subscribes to for real-time marker updates.

## Maintenance — `/api/v1/maintenance`

All routes require auth. RBAC: `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER` can create, read, and update (scheduling and updating a service record, including cancelling one via a status change, is routine fleet-ops work — same tier as trips/assignments). `VIEWER` is read-only. `DRIVER` has no access. Org-scoped via the vehicle relation (`Maintenance` has no `organizationId` of its own) — cross-org access is `404`. There is no delete endpoint — set `status: "CANCELLED"` via `PATCH` instead.

### Vehicle status sync (§14/§48)
Setting a record's `status` to `IN_PROGRESS` puts its vehicle into `Vehicle.status: "MAINTENANCE"`. Moving it out of `IN_PROGRESS` (to `COMPLETED` or `CANCELLED`) returns the vehicle to `ACTIVE` — but only if no *other* maintenance record on that vehicle is still `IN_PROGRESS`. This is what makes the trip rule "a vehicle under maintenance cannot start a new trip" (Phase 8) actually mean something; without this sync nothing would ever set that status. Completing a record with a `mileage` reading also bumps `Vehicle.currentMileage`, same pattern as ending a trip.

A record that's `COMPLETED` or `CANCELLED` is terminal — `400` on any further `PATCH`, same finality rule as a Trip once it's left `SCHEDULED`.

### GET `/maintenance` *(requires `maintenance:read`)*
Query: `page`, `limit`, `vehicleId`, `status`, `type`, `dueBefore` (filters `nextServiceDate <= dueBefore` — an "upcoming maintenance" view), `organizationId` (`SUPER_ADMIN` only).

Each record includes `vehicle` and a computed `kmUntilService` (`nextServiceMileage - vehicle.currentMileage`, or `null` if `nextServiceMileage` isn't set) — the spec's "Service due in 1,300 km" example (§14). This is computed at read time; there is no background job yet proactively generating expiry alerts from it (needs the BullMQ infrastructure from a later phase).

### POST `/maintenance` *(requires `maintenance:create`)*
```json
{
  "vehicleId": "veh_123",
  "type": "OIL",
  "description": "Oil and filter change",
  "nextServiceDate": "2026-04-01",
  "nextServiceMileage": 50000,
  "cost": 45.5
}
```
Defaults to `status: "SCHEDULED"`. Creating one directly with `status: "IN_PROGRESS"` immediately marks the vehicle under maintenance.

### GET `/maintenance/:id` *(requires `maintenance:read`)*

### PATCH `/maintenance/:id` *(requires `maintenance:update`)*
Any field from create, plus `status`. `400` if the record is already `COMPLETED`/`CANCELLED`.

## Fuel — `/api/v1/fuel`

All routes require auth. RBAC: submission (`POST /fuel`) is driver-only and ownership-gated (their own actively-assigned vehicle, cross-checked against the payload — same pattern and same rationale as GPS location ingestion, see [docs/gps-tracking.md](gps-tracking.md#authorization-model)), **not** governed by the permission matrix. Reading: `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER`/`VIEWER` get the `fuel:read` matrix grant (the whole org's records); a `DRIVER` instead gets an **ownership** view (added Phase 19, for the mobile Driver Home fuel summary) — `GET /fuel` and `GET /fuel/:id` silently scope to *their own* submitted records rather than requiring the matrix grant they don't have, same split as documents. Correcting a record (`PATCH`) stays admin-tier only — a driver still can't edit after submitting, preventing after-the-fact tampering with cost data. Org-scoped via the vehicle relation.

### POST `/fuel` *(driver only, ownership-gated)*
```json
{ "vehicleId": "veh_123", "fuelType": "DIESEL", "quantity": 40, "pricePerLiter": 1.5, "odometer": 12000, "station": "Shell - Main St", "clientId": "optional-offline-queue-uuid" }
```
`totalCost` is computed as `quantity × pricePerLiter` if not supplied. `403` if `vehicleId` doesn't match the driver's active assignment, or if the caller isn't a driver. `clientId` (Phase 19) is an optional client-generated dedup key for the mobile offline sync queue — resubmitting the same `clientId` (e.g. a retry after a dropped connection lost the original response) returns the original record (`replayed: true`) instead of creating a duplicate; see [docs/architecture.md#offline-sync](architecture.md#offline-sync-phase-19).

**Abnormal-usage heuristic (§15)**: a fill of 20L+ with less than 50km since the driver's previous fill on the same vehicle is flagged (`flagged: true` in the response) and raises a `FUEL_ANOMALY` `Alert` row. These thresholds are illustrative defaults (`src/services/fuelService.js`), not tuned per fleet. The Alert *management* API (list/resolve) doesn't exist until Phase 15 — the row is written regardless and becomes queryable once that API lands.

### GET `/fuel`
Admin-tier: query `page`, `limit`, `vehicleId`, `driverId`, `dateFrom`/`dateTo`, `organizationId` (`SUPER_ADMIN` only), scoped to the org. A `DRIVER` caller ignores all of these except `page`/`limit`/`dateFrom`/`dateTo` and always sees only their own records.

### GET `/fuel/:id`
`404` (not `403`) for a record outside the caller's access — another org's, or (for a driver) another driver's own submission.

### PATCH `/fuel/:id` *(requires `fuel:update`)*
Any field from create except `vehicleId`. For correcting a mis-entered record — there's no delete endpoint.

### GET `/fuel/summary` *(requires `fuel:read`)*
Query: `vehicleId`, `driverId`, `dateFrom`/`dateTo`, `organizationId` — all optional, and combinable, so this one endpoint covers §15's three views ("daily/monthly fuel cost" = no vehicle/driver filter, "vehicle fuel efficiency" = `vehicleId`, "driver fuel usage" = `driverId`):
```json
{
  "success": true,
  "data": {
    "recordCount": 12,
    "totalQuantity": 480,
    "totalCost": 720.5,
    "totalDistance": 6200,
    "efficiencyKmPerLiter": 12.92,
    "costPerKm": 0.12
  }
}
```
`totalDistance` sums `Trip.distance` for completed trips in the same scope/date range; `efficiencyKmPerLiter`/`costPerKm` are `null` when there's no distance to divide by.

## Expenses — `/api/v1/expenses`

All routes require auth. Every expense starts `PENDING` regardless of who created it — even an admin's own entry goes through the same approval step, so there's one consistent audit trail rather than a special-cased auto-approve path. Org-scoped via the vehicle relation.

**Creation (`POST /expenses`) is dual-path**, not gated by `authorize` at the route level:
- A `DRIVER` can submit a claim for their own actively-assigned vehicle — ownership-gated and `vehicleId`-cross-checked, same pattern and rationale as fuel/location (a driver has no matrix-level `expenses` grant at all).
- Any role with `expenses:create` (`SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER`) can enter one directly for any vehicle in their org.

**Approval** (`expenses:approve`) is `SUPER_ADMIN`/`FLEET_ADMIN` only — `FLEET_MANAGER` can create and edit but not sign off, same hierarchy reasoning as vehicle retirement being admin-only. `VIEWER` is read-only.

### POST `/expenses`
```json
{ "vehicleId": "veh_123", "category": "TOLL", "amount": 4.5, "description": "NH48 toll", "receiptUrl": "https://..." }
```
`403` if a driver's `vehicleId` doesn't match their active assignment, or if a non-driver caller lacks `expenses:create`.

### GET `/expenses` *(requires `expenses:read`)*
Query: `page`, `limit`, `vehicleId`, `category`, `status`, `dateFrom`/`dateTo`, `organizationId` (`SUPER_ADMIN` only).

### GET `/expenses/:id` *(requires `expenses:read`)*

### PATCH `/expenses/:id` *(requires `expenses:update`)*
Any field from create except `vehicleId`. `400` unless the expense is still `PENDING` — an approved/rejected expense is a closed financial record.

### PATCH `/expenses/:id/approve` and `/reject` *(requires `expenses:approve`)*
No body. Sets `status`, `approvedById`, `approvedAt`. `400` if the expense isn't currently `PENDING`.

## Documents — `/api/v1/documents`

All routes require auth but none carry route-level `authorize` — a driver's ownership path (their own Driver record) and an admin's matrix path (`documents:*`) both need to reach the same handlers, so `documentService` branches on role internally (same pattern as fuel/expenses). Full design: [docs/security.md](security.md#file-uploads).

A Document belongs to **exactly one** of `vehicleId`/`driverId` — enforced by the validator, not just convention (`docs/database.md#document-ownership`). `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER` get full CRUD on any document in their org; `VIEWER` is read-only; `DRIVER` can only act on documents linked to their own Driver record.

### The upload flow
Files never pass through this API. The client:
1. `POST /documents/upload-credentials` with `{ vehicleId | driverId, contentType? }` — returns a short-lived signed credential for whichever provider `STORAGE_PROVIDER` is configured to (Cloudinary: a signed upload form; S3: a presigned PUT URL + the resulting public `fileUrl`).
2. Uploads the file **directly** to that provider using the returned credential.
3. `POST /documents` with the resulting `fileUrl` (from the provider's response, for Cloudinary; precomputed, for S3) to create the metadata record.

### POST `/documents/upload-credentials`
```json
{ "vehicleId": "veh_123", "contentType": "image/jpeg" }
```
`403`/`404` using the same ownership/scope rules as create (below) — you can't get a valid signed URL for a subject you have no business attaching files to. `500 "File storage is not configured"` if the selected provider's credentials aren't set in the environment.

### POST `/documents`
```json
{ "vehicleId": "veh_123", "type": "INSURANCE", "documentNumber": "POL-9910", "expiryDate": "2027-01-01", "fileUrl": "https://..." }
```
`403` if a driver tries to create anything other than their own driver document, or if a non-driver caller lacks `documents:create` / the vehicle-or-driver is out of their org scope.

### GET `/documents`
Query: `page`, `limit`, `vehicleId`, `driverId`, `type`, `expiringBefore`, `organizationId` (`SUPER_ADMIN` only). A `DRIVER` caller always sees only their own documents, regardless of query params — there's no separate `/documents/me`.

### GET `/documents/:id`, PATCH `/documents/:id`
`404` for a document outside the caller's access (cross-org, or another driver's document) — never `403`, same existence-hiding pattern used everywhere else. `PATCH` accepts `documentNumber`, `issueDate`, `expiryDate`, `fileUrl` (replacing the file also best-effort deletes the old one from storage).

### DELETE `/documents/:id`
**Hard delete** — the only resource in the app that isn't soft-deleted. Nothing has a `Restrict` foreign key to `Document` (unlike Vehicle/Driver/Trip), and a stale/expired/replaced document should actually be removable rather than accumulate as permanent clutter. Also deletes the underlying file from storage (best-effort — a failed remote delete never blocks removing the DB record).

## Alerts — `/api/v1/alerts`

All routes require auth and `alerts:read`/`alerts:resolve`. `SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER` can read and resolve; `VIEWER` is read-only; `DRIVER` has no access — alerts are a manager-facing resource even when one happens to reference a specific driver (e.g. their own license expiring). Org-scoped via `Alert.organizationId` directly.

Rows are written by two things: the fuel-anomaly heuristic (Phase 12, `type: FUEL_ANOMALY`) and the background jobs described in [docs/architecture.md#background-jobs](architecture.md#background-jobs) (`DOCUMENT_EXPIRY`, `LICENSE_EXPIRY`, `VEHICLE_MAINTENANCE`, `VEHICLE_OFFLINE`). This phase adds the read/resolve API on top of rows that (in the fuel case) have been generated since Phase 12.

### GET `/alerts` *(requires `alerts:read`)*
Query: `page`, `limit`, `type`, `severity`, `isResolved`, `vehicleId`, `driverId`, `organizationId` (`SUPER_ADMIN` only). Sorted unresolved-first, then by severity, then newest first.

### GET `/alerts/:id` *(requires `alerts:read`)*

### PATCH `/alerts/:id/resolve` *(requires `alerts:resolve`)*
No body. Sets `isResolved`, `resolvedById`, `resolvedAt`. `400` if already resolved. Note: a `VEHICLE_OFFLINE` alert may also be resolved automatically by the background job (`resolvedById: null` in that case) if the vehicle starts reporting location again before a human resolves it.

## Notifications — `/api/v1/notifications`

All routes are ownership-only — no permission-matrix entry, since every role can only ever see/manage their own notifications (same as `/users/me` needing no `authorize` check). Every Notification row is created by another service as a side effect (trip assignment/cancellation, expense approval/rejection, a newly-created alert) — there's no `POST /notifications` for creating one directly.

Delivery is two-channel: the in-app row (source of truth, always written) plus a best-effort push via Expo if the user has a registered `pushToken` — a failed or skipped push never blocks the in-app notification from existing, same degrade-gracefully pattern as `mailService`.

| Event | Recipient | `type` |
|---|---|---|
| Trip created | The assigned driver | `TRIP_ASSIGNED` |
| Trip cancelled | The assigned driver | `TRIP_UPDATED` |
| Expense approved/rejected | The expense's creator | `EXPENSE_APPROVED` / `EXPENSE_REJECTED` |
| New `VEHICLE_MAINTENANCE` / `DOCUMENT_EXPIRY` / `LICENSE_EXPIRY` alert | All admin-tier users in the org | matching type (`MAINTENANCE_DUE`, `DOCUMENT_EXPIRY`, `LICENSE_EXPIRY`) |
| New `FUEL_ANOMALY` / `VEHICLE_OFFLINE` alert | All admin-tier users in the org | `ALERT` |

Note: only the *first* creation of an alert notifies — an escalating severity update (Phase 15's find-or-update pattern) doesn't re-notify, so a deadline ticking through 30/15/7/1 days doesn't spam four notifications about the same thing.

### GET `/notifications`
Query: `page`, `limit`, `isRead`, `type`. Response includes `unreadCount` (independent of the current filter/page) alongside the paginated list.

### PATCH `/notifications/:id/read`
`404` if the notification isn't the caller's own (never `403` — same existence-hiding pattern as everywhere else). Idempotent — marking an already-read notification read again just returns it unchanged.

### PATCH `/notifications/read-all`
No body. Marks every unread notification for the caller as read; returns `{ markedRead: <count> }`.

## Geofences — `/api/v1/geofences`

RBAC: `SUPER_ADMIN`/`FLEET_ADMIN` full CRUD; `FLEET_MANAGER` read+update only (create/delete are fleet-configuration decisions, same tier reasoning as vehicles); `VIEWER` read-only; `DRIVER` no access. "Delete" is a soft deactivate (`isActive: false`) — the schema already carried that field.

### GET `/geofences` *(requires `geofences:read`)*
Query: `page`, `limit`, `isActive`, `organizationId` (`SUPER_ADMIN` only).

### POST `/geofences` *(requires `geofences:create`)*
```json
{ "name": "Warehouse", "latitude": 12.9716, "longitude": 77.5946, "radiusMeters": 200, "notifyOnEvent": true }
```
`notifyOnEvent` (default `true`) is the spec's "notify managers **when configured**" escape hatch — set `false` for a high-traffic zone (e.g. the home warehouse) where every entry/exit would otherwise flood the alerts list.

### GET `/geofences/:id`, PATCH `/geofences/:id`, DELETE `/geofences/:id`
Standard shape; `DELETE` (`geofences:delete`) is the soft deactivate described above — `400` if already inactive.

### Entry/exit detection
Wired into `POST /api/v1/location` (Phase 9) — every accepted GPS point is checked against all active geofences in the driver's org. State (inside/outside) is derived from the *last* `GeofenceEvent` for that (geofence, vehicle) pair, so a batch of offline-queued points is processed in chronological order to get transitions right, not by comparing to the previous raw coordinate. A transition:
- creates a `GeofenceEvent` (`ENTERED`/`EXITED`),
- broadcasts `geofence:event` over Socket.IO to the org's fleet room (same room as `vehicle:location`, see [docs/gps-tracking.md](gps-tracking.md)),
- and, if `notifyOnEvent` is true, creates a `GEOFENCE_BREACH` `Alert` and notifies org managers (see [Notifications](#notifications--apiv1notifications)).

A geofence check failure never blocks the GPS point itself from being recorded — logged, not surfaced as an ingestion error.

## Dashboard & Reports

All routes require `reports:read` (`SUPER_ADMIN`/`FLEET_ADMIN`/`FLEET_MANAGER`/`VIEWER`; `DRIVER` has no access). Every endpoint accepts `dateFrom`/`dateTo` (default: last 30 days, resolved server-side — see `src/utils/dateRange.js`) and `organizationId` (`SUPER_ADMIN` only; omitting it aggregates across every organization, same "no filter = everything" convention as every other list endpoint for that role).

### GET `/api/v1/dashboard/kpis`
The §20/§49 dashboard numbers in one call:
```json
{
  "period": { "from", "to" },
  "fleet": { "totalVehicles", "activeVehicles", "maintenanceVehicles", "availableVehicles" },
  "drivers": { "totalDrivers", "activeDrivers" },
  "trips": { "activeTrips", "completedTrips" },
  "alerts": { "unresolved" },
  "costs": { "fuelCost", "maintenanceCost" },
  "distance": { "totalKm" },
  "fleetUtilizationPercent",
  "averageFuelEfficiencyKmPerLiter"
}
```
`availableVehicles` = active vehicles minus those currently on an in-progress/paused trip. `fleetUtilizationPercent` = (sum of completed-trip durations in the period) / (active vehicle count × period length), per §21's formula.

### GET `/api/v1/reports/fleet`
Per-vehicle trip count, active hours, distance, and utilization percent, plus a fleet-wide summary. **`maintenanceDowntimePercent` is a documented approximation** — it's the current share of the fleet in `MAINTENANCE` status (a snapshot), not the spec's literal time-integrated downtime ratio, because the schema has no vehicle status-change history table to compute that precisely from. A real implementation of exact historical downtime would need one; not built here.

### GET `/api/v1/reports/fuel`
Reuses Phase 12's `fuelService.getSummary` for the org-wide `summary`, plus a `byVehicle` breakdown (quantity, cost, distance, efficiency) for comparing vehicles.

### GET `/api/v1/reports/maintenance`
`summary` (completed count/cost, currently-scheduled count, currently-overdue count — the latter two are snapshots, not period-bound) and `byType` (cost/count per `MaintenanceType`).

### GET `/api/v1/reports/drivers`
Optional `driverId` to scope to one driver. Per driver: `tripsCompleted`, `lateTrips` (started more than 15 minutes after `scheduledAt`), `averageSpeedKmh` (from `Location.speed` readings in the period), `fuelEfficiencyKmPerLiter` (via the same fuel summary), and **`reportedIncidents: null`** — `IssueReport` has no CRUD API yet (not part of this project's 21-phase build so far), so there's no real data to report; `null` makes that gap visible rather than a fabricated `0` silently implying zero incidents.

## Misc

### GET `/health`
Unauthenticated liveness check: `{ "success": true, "data": { "status": "ok" } }`.

---

Further resource endpoints (vehicles, drivers, trips, etc.) are documented here as each phase adds them.
