# Security

## Passwords

- Hashed with `bcryptjs` (cost factor 12) — never stored or logged in plaintext.
- Policy enforced at the validation layer (`src/validators/authValidators.js`): 8+ characters, at least one uppercase, one lowercase, one digit.
- `bcryptjs` (pure JS) was chosen over native `bcrypt` specifically to avoid a transitive `npm audit` critical (node-tar, via `@mapbox/node-pre-gyp`, bcrypt's native-binding installer) and to avoid requiring native build tooling on every developer machine (especially Windows). No behavior difference — same `hash`/`compare` API.

## Tokens

- **Access token**: JWT, signed with `JWT_SECRET`, 15 minute default expiry (`JWT_ACCESS_EXPIRES_IN`). Carries `{ sub, role, organizationId }`, but `authenticate` middleware re-fetches the user from the database on every request rather than trusting those claims — so a deactivated account or role change takes effect immediately, not after the token expires.
- **Refresh token**: a high-entropy random value (not a JWT), stored **hashed** (SHA-256 — appropriate for high-entropy random values, unlike bcrypt for user-chosen passwords) in the `RefreshToken` table, default 30 day expiry (`JWT_REFRESH_EXPIRES_IN`). Rotated on every use: `POST /auth/refresh` revokes the presented token and issues a new one, linked via `replacedByTokenId`.
- **Reuse detection**: presenting an already-revoked refresh token revokes every other outstanding refresh token for that user — a revoked-but-presented token is a signal the token may have leaked (e.g. stolen and used by an attacker after the legitimate client already rotated it).
- Both password reset and password change **revoke all of a user's refresh tokens**, forcing re-authentication on every device.

## Request pipeline

Every route: `authenticate` (identity, JWT + DB re-check) → `authorize` (role/permission) → `validate` (Zod schema) → controller → service → Prisma. Business rules live in the service layer, never in controllers, so they can't be bypassed by a new route that skips them.

## RBAC

- Single source of truth: `src/constants/permissions.js` — a `{ role: { resource: [actions] } }` matrix, checked by `src/middleware/authorize.js`. Only role-level capability is checked here ("can a FLEET_MANAGER read users at all?"); it's populated per-resource as each resource's routes land (`users` in Phase 4, `vehicles` in Phase 5, ...) rather than speculatively filled in ahead of time.
- **Organization scoping** is enforced separately, in the service layer, because it needs the specific record being acted on: every non-SUPER_ADMIN role is confined to their own `organizationId`. Cross-org access attempts return `404` (not `403`) so a caller can't distinguish "doesn't exist" from "exists in another org."
- **Privilege escalation guard**: only a `SUPER_ADMIN` can create or promote a user to `SUPER_ADMIN` — enforced in `userService`, independent of the route-level `authorize` check.
- **Self-lockout guard**: a user (including `FLEET_ADMIN`) can never deactivate their own account via the users API.
- Role capabilities per the product spec (§5) — see `src/constants/permissions.js` for the current matrix and its extension pattern.

## Rate limiting

- General: 300 requests / 15 min / IP across the whole API.
- Auth-specific (`/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`): 20 requests / 15 min / IP — the routes most worth protecting against brute force and enumeration.

## Transport & headers

- `helmet()` for standard security headers.
- `cors` restricted to `CORS_ORIGIN` (not `*` in production).
- HTTPS is a deployment-time requirement (terminated at the platform/load balancer — see `docs/deployment.md`), not something the app enforces itself.

## Input validation

- Every mutating route validates `req.body` against a Zod schema before it reaches the controller (`src/middleware/validate.js`). Unknown/malformed fields are rejected with a consistent `422 { success: false, message, errors: [{field, message}] }` shape.

## Error handling

- `AppError` (operational, expected errors) vs. everything else (`errorMiddleware.js` treats as an unexpected `500`). Stack traces and internal error details are **never** sent to the client in production (`NODE_ENV=production`); only in local dev.
- Unexpected errors are logged via `winston` (`src/utils/logger.js`) with the request path — but the logger's callers are responsible for never passing passwords, tokens, or other secrets into logged metadata.

## Audit trail

`AuditLog` rows are written by the service layer (not controllers, so they can't be skipped by a new route) for: `REGISTER`, `LOGIN`, `CHANGE_PASSWORD`, `RESET_PASSWORD` so far; more actions are added as each resource (vehicles, drivers, trips, assignments, expense approvals) lands. `AuditLog.userId` is a nullable, `SetNull`-on-delete foreign key so the trail survives even if the acting user is later deleted.

## Email

`mailService.js` sends real SMTP mail when `SMTP_HOST` is configured; otherwise it falls back to `nodemailer`'s `jsonTransport`, which formats the message but never actually delivers it — appropriate for local dev/CI so password-reset flows are fully exercisable without real mail credentials.

## File uploads

Uploaded files never pass through this Node process — `src/services/storageService.js` issues a short-lived (5 minute) signed credential (a signed Cloudinary upload form, or a presigned S3 `PUT` URL) that the **client** uploads directly to the object storage provider with. The backend only ever receives the resulting `fileUrl` back, when the client calls `POST /documents` to create the metadata record.

- **Provider-agnostic**: callers (`documentService`) never talk to Cloudinary/AWS SDKs directly, only through `storageService`'s `getUploadCredentials`/`deleteFile`. Switching `STORAGE_PROVIDER` touches no calling code.
- **Authorization happens before a credential is ever issued**: `getUploadCredentials` runs the same ownership/scope checks as creating the Document record itself (§ [documents](api.md#documents--apiv1documents)) — a caller can't obtain a valid signed URL for a vehicle/driver they have no access to.
- **Signing is pure and offline-testable**: Cloudinary's signature is an HMAC over the request params with the API secret; S3's presigned URL is SigV4 signing. Neither makes a network call or validates credentials against the provider at signing time — which is also why `tests/storageService.test.js` can verify the exact signed output using dummy credentials, entirely offline.
- **Never store files in Postgres** — `Document.fileUrl` is just a string pointer to the object in storage.
- Deleting a document (`DELETE /documents/:id`, or replacing its `fileUrl` via `PATCH`) best-effort deletes the underlying file from storage; a failed remote delete is logged but never blocks the database change — the DB is the source of truth for what's attached to a vehicle/driver, an orphaned file in storage is a cleanup concern, not a correctness one.

## Secrets

All secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, SMTP credentials, storage provider keys) are read from environment variables only (`src/config/env.js`), which fails fast at process boot if a required variable is missing. `.env` is git-ignored; `.env.example` documents every variable without real values.

## Socket.IO

Every connection authenticates via a JWT access token passed in the handshake (`socket.handshake.auth.token`), verified and re-checked against the database exactly like the `authenticate` HTTP middleware — an unauthenticated or deactivated-account connection is rejected (`connect_error`) before it can join any room. There's no anonymous or partially-authenticated state. Full detail: [docs/gps-tracking.md](gps-tracking.md#authorization-model).

## Not yet implemented (tracked for later phases)

- Permission-matrix entries for resources beyond `users`/`vehicles`/`drivers`/`assignments`/`trips` (added alongside each resource's routes).
- Per-request audit coverage for maintenance/fuel/expense mutations (added alongside those resources).
