# Architecture

## System overview

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   Mobile App (Expo/RN)  │         │   Admin Web Dashboard*    │
│  Manager UI | Driver UI │         │  (post-MVP, optional)     │
└────────────┬─────────────┘         └─────────────┬────────────┘
             │ HTTPS (REST, JWT)                    │
             ▼                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express.js API Layer                     │
│  Routes → Middleware (auth/RBAC/validate) → Controllers      │
└────────────┬───────────────────────────────┬────────────────┘
             │                                │
             ▼                                ▼
┌─────────────────────────┐      ┌─────────────────────────────┐
│   Service Layer          │      │   Socket.IO Gateway          │
│  business logic, rules   │      │  auth'd namespaces/rooms     │
└────────────┬─────────────┘      │  vehicle:location,           │
             │                    │  trip:*, alert:*, issue:*    │
             ▼                    └───────────┬───────────────────┘
┌─────────────────────────┐                   │
│  Repository / Prisma ORM │◄──────────────────┘ (writes location,
└────────────┬─────────────┘                      broadcasts to rooms)
             │
             ▼
┌─────────────────────────┐   ┌───────────────────┐   ┌────────────────┐
│  PostgreSQL (Neon/RDS)   │   │  Redis (BullMQ)    │   │ Object Storage │
│  transactional + geo data│   │  jobs, queues       │   │ S3/Cloudinary  │
└───────────────────────────┘   └───────────────────┘   └────────────────┘
```

Request pipeline per route: `authenticate` (JWT) → `authorize(role, permission)` → `validate` (Zod) → `controller` → `service` → `repository (Prisma)`. Controllers stay thin; all business rules live in the service layer so they're unit-testable without HTTP.

### Mobile → Socket.IO → real-time tracking

```
Driver device (Expo Location, background task)
   → batches GPS samples locally (offline queue if no network)
   → emits over Socket.IO (authenticated on connect via JWT)
   → server validates payload, writes to Location table
   → server broadcasts to room `org:{orgId}:fleet`
   → Manager devices subscribed to that room update markers live
   → REST fallback (POST /api/v1/location) used if socket disconnected
```

Two write paths intentionally: Socket.IO for live push to managers, REST as a durable fallback/offline-sync path for drivers. Both land in the same service function so business rules run once regardless of transport.

## Database

See [docs/database.md](database.md) for the full ER diagram, cascade rules, and constraints. Schema source of truth: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma).

## API

RESTful, versioned under `/api/v1`. Full endpoint list will live in `docs/api.md`, populated as each resource's routes are built (starting Phase 3).

## Mobile navigation

```
RootNavigator
 ├─ AuthStack (unauthenticated)
 │   ├─ Login / ForgotPassword / ResetPassword
 └─ AppStack (authenticated; session restored from SecureStore)
     ├─ role === DRIVER → DriverTabNavigator
     │   Home, Trips, Vehicle, Fuel, ReportIssue, Notifications, Profile
     └─ role in {SUPER_ADMIN, FLEET_ADMIN, FLEET_MANAGER, VIEWER}
         → ManagerTabNavigator
         Dashboard, Fleet, Drivers, Trips, LiveMap, Maintenance,
         Fuel, Expenses, Alerts, Reports, Settings
```

Navigation is gated by role at the top level; individual screens additionally hide actions a role can't perform. The API is the actual enforcement boundary, never the client.

## Security

- JWT access token (~15 min) + refresh token (~30 days, rotated on use, hashed at rest in `RefreshToken`, individually revocable).
- Role stored in JWT but re-checked against the DB on sensitive writes.
- Permission matrix defined once (`constants/permissions.js`), enforced by an `authorize(resource, action)` middleware.
- bcrypt (cost 12) for passwords.
- `helmet`, locked-down `cors`, `express-rate-limit` (stricter on `/auth/*`).
- Zod validation at every mutating route boundary; unknown fields rejected.
- No raw SQL string interpolation — Prisma's parameterized queries only.
- File uploads via presigned URLs; Node never proxies raw file bytes.
- Socket.IO connections authenticated via JWT in the handshake; a driver can only emit location for their own actively-assigned vehicle (checked server-side, never trusted from the payload).
- Every create/update/delete on Vehicle, Driver, Trip, Assignment, expense approvals, and role changes writes an `AuditLog` row.
- Secrets only via `.env` (see `backend/.env.example`), never committed.

Full detail: `docs/security.md` (populated as auth/RBAC land in Phase 3–4).

## GPS tracking

- Interval policy (configurable): active trip → 15s; idle → 3 min; backgrounded → OS-driven significant-location-change, throttled server-side per vehicle.
- Primary transport: Socket.IO `vehicle:location`. Durability fallback: `POST /api/v1/location` (single point or batch array), used by the offline sync queue on reconnect.
- Dedup: each point carries a client-generated UUID (`Location.clientId`) + device timestamp; server upserts on UUID, orders by timestamp not receipt time.
- Degraded conditions handled explicitly: permission denied, poor accuracy, network loss (AsyncStorage-backed queue, FIFO flush, capped size), app killed/restarted (`expo-task-manager` background task resumes state), and vehicle-offline detection (BullMQ job flags a vehicle `OFFLINE` if silent for N minutes during an active trip).
- `Location` is the fastest-growing table; indexed on `(vehicleId, timestamp DESC)`, with a planned retention/rollup job so it scales toward thousands of vehicles without the table becoming unqueryable.

Full detail: `docs/gps-tracking.md` (populated in Phase 9).

## Key business rules

| Rule | Enforcement point |
|---|---|
| One active driver per vehicle, one active vehicle per driver | Partial unique DB index + service-level check on assignment create |
| Driver with expired license cannot be assigned a trip | Service check on trip create/assign against `Driver.licenseExpiry` |
| Vehicle under maintenance cannot start a new trip | Service check on `trip:start` against `Vehicle.status` |
| Completed trip cannot restart; cancelled trip cannot complete | Trip state machine — explicit allowed-transition table |
| Only authorized roles modify fleet records | `authorize` middleware per route |
| All important changes recorded in AuditLog | Service-layer write-through, not controller-level |

## Technology decisions

| Choice | Why |
|---|---|
| React Native + Expo, JS (no TS) | Managed builds (EAS), OTA updates, first-class `expo-location`/`expo-notifications`/`expo-secure-store`. |
| React Navigation | Standard, handles the auth-gated + role-gated nested navigator structure cleanly. |
| TanStack Query | Server-state caching/invalidation separate from ephemeral client state; retry/refetch behavior suits a flaky mobile network. |
| Zustand | Minimal client state (session, active-trip tracking, offline queue) without Redux boilerplate. |
| Node/Express + JS | Fast iteration, no build step; middleware model maps directly onto the auth→authz→validate→controller pipeline. |
| PostgreSQL + Prisma | Relational integrity for business rules (FKs, unique constraints); portable across Render/Railway/Neon/RDS. |
| Socket.IO | Push-based live tracking instead of polling; reconnection/fallback transports built in; room-based broadcast maps onto `org:{id}:fleet`. |
| Redis + BullMQ | Durable scheduled/background jobs (expiry checks, offline detection, notification fan-out) instead of `setInterval`. |
| Object storage (S3/Cloudinary, abstracted) | Files don't belong in Postgres; `storageService.js` keeps the provider swappable. |
| Zod | Composable validation schemas, clear error shape for the `{success:false, errors:[]}` API contract. |

## Mobile app implementation notes

- **Session restore**: `authStore.restoreSession()` reads persisted tokens from SecureStore, then re-validates against `GET /users/me` rather than trusting a cached user object — a role change or deactivation made server-side takes effect the next time the app is opened, not never. `RootNavigator` shows a loading state until this resolves, then renders `AuthStack` or a role-based tab navigator.
- **Silent token refresh**: `src/services/api.js`'s axios response interceptor retries exactly once on a `401`, and concurrent 401s share a single in-flight refresh call (`refreshPromise`) rather than each firing their own — otherwise several screens hitting a just-expired token at once would race multiple refresh attempts against the same single-use, rotating refresh token (see docs/security.md#tokens) and only one would win.
- **Screens are built incrementally**, not all at once per phase: `ManagerTabNavigator`/`DriverTabNavigator` only register tabs that are genuinely functional today (Live Map + Profile). A resource's mobile screen (Fleet, Drivers, Trips, ...) is added when that backend area is next revisited, rather than stubbing placeholder tabs — see each navigator file's header comment for what's deferred and why.
- **Driver Home + offline queue** (Phase 19): the Driver tab bar's landing screen — assigned vehicle, current/next trip, Start/End Trip wired through the offline queue (`tripService.startTrip`/`endTrip`), a fuel-cost/distance-today summary, and a visible "N pending sync" badge (`PendingSyncBadge`) whenever queued actions haven't flushed yet — offline state is surfaced, never silent. See "Offline sync" below for the queue itself.
- **Dashboard screen** (Phase 18): the manager tab bar's landing screen — a plain stat-tile grid pulling from `GET /dashboard/kpis`, deliberately numbers rather than charts (the spec itself asks for a simple, uncluttered dashboard; a chart library would also sit awkwardly against the one-bit visual system).
- **Live Map geofence overlay** (Phase 17): zones render as desaturated circles (`react-native-maps`' `<Circle>`) plus a small square marker at each center (distinct from a vehicle's pin shape — meaning conveyed by shape, not color, consistent with the one-bit system) with a "Zones" toggle chip. Fetched with a 5-minute `staleTime` since geofences change far less often than vehicle positions.
- **Design tokens**: `src/constants/theme.js` is the single source for colors/spacing/type. The visual system is deliberately one-bit — pure black and white only, no gradients or shadows, sharp (unrounded) corners, status conveyed through text/weight/fill instead of color (per explicit user direction; a stricter reading of the "professional, minimal, operational" UI philosophy in §28 than color-coded status badges would have been). The one inherently colorful surface, the map, is desaturated via a Google Maps style JSON (`src/constants/mapStyle.js`) rather than left as a colorful island in an otherwise monochrome app.
- **Shared layout components**: `ScreenHeader` (title + optional right-aligned meta string) and `EmptyState` (message + optional action) standardize two patterns that would otherwise be reinvented per screen. Interactive components (`PrimaryButton`, `StatusBadge`, map filter chips) carry explicit `accessibilityRole`/`accessibilityLabel`/`accessibilityState` rather than relying on visual-only cues, per the "accessibility" requirement in §28.

## Background jobs

```
BullMQ Queue ('alerts')          BullMQ Worker ('alerts')
  scheduler.js registers    ──►    worker.js dispatches by job name
  two repeatable jobs:             to alertGenerationService:
    daily-checks (cron 08:00)        runDailyChecks() = document +
    offline-check (every 5 min)        license expiry + maintenance due
                                      runOfflineCheck() = vehicle-offline
                                        detection (+ auto-resolve)
```

- **Each BullMQ component gets its own Redis connection** (`config/redis.js` is a factory, not a shared singleton). This was tried the other way first (one shared `ioredis` instance for both Queue and Worker) and caused a real bug: when Redis was unreachable, a rejection from one component's connection lifecycle wasn't caught by the other's listeners, producing a genuinely unhandled promise rejection that crashed the whole HTTP server — not just the background jobs. Caught by an actual boot-without-Redis smoke test, not by inspection.
- **Never blocks server startup**: `initJobs()` is called from `server.js` without `await`, and internally bounds how long it waits to register schedules (5s timeout) before logging and moving on — the underlying connection keeps retrying in the background regardless, and jobs start working the moment Redis becomes reachable, no restart needed.
- **Error logging is throttled** (`utils/throttledLogger.js`): while Redis is down, BullMQ's Queue/Worker fire `'error'` on every failed reconnect attempt (multiple times a second) — without throttling this floods the log for as long as the outage lasts.
- **The job logic itself is decoupled from BullMQ**: `alertGenerationService.js`'s four check functions are plain async functions that only touch Prisma — the worker just dispatches to them by job name. They're callable (and tested) directly, independent of whether Redis/BullMQ is even running.
- **Escalation, not duplication**: the expiry/maintenance checks use a find-or-update pattern (`upsertSubjectAlert`) keyed on (type, vehicle-or-driver, unresolved) rather than creating a new Alert row every run — severity escalates on the same alert as a deadline approaches (the spec's "30/15/7/1 days before"), rather than spamming duplicate rows.
- **Vehicle-offline detection can also resolve**: unlike the expiry checks, `checkVehicleOffline` clears an alert automatically once the vehicle reports a fresh location — no manual "mark resolved" needed for a transient connectivity blip.

## Offline sync (Phase 19)

```
Driver taps Start/End Trip or saves a fuel record
        │
        ▼
offlineQueue.enqueue(type, payload)   — AsyncStorage-persisted, survives app restart
        │
        ▼
flush() — processes the queue in order
        │
   ┌────┴────┐
   ▼         ▼
success   error
   │         │
   │    err.response present?
   │      │         │
   │     no        yes
   │      │         │
   │   stop,     drop the item —
   │   retry     either it's an
   │   later     "already done"
   │  (NetInfo   state-machine
   │  reconnect  error (the exact
   │   event)    shape a retried-
   │             after-lost-
   │             response submission
   │             produces) or a real
   │             validation failure;
   │             neither is fixed by
   │             retrying the same
   │             payload
   │
   ▼
remove from queue, persist, notify subscribers
```

- **Idempotent by design, not by luck.** Trip start/end need no special dedup mechanism — the state machine's own finality checks (`tripStateMachine.js`, Phase 8) already turn a retried "start an already-started trip" into a `400` the client recognizes as "this already happened," not a real error. Fuel record submission *is* a create, so it needed the same dedup key GPS location ingestion already used: `FuelRecord.clientId` (Phase 19), mirroring `Location.clientId` (Phase 9) exactly — a retried submission after a lost response returns the original record instead of creating a duplicate fill-up.
- **A network failure and a real API error are handled differently**, and the distinction is `err.response` (axios convention: present when the server responded at all, absent when the request never got a response). Only a genuine network failure pauses the queue; anything the server actually rejected is dropped rather than retried forever.
- **Persisted to AsyncStorage, not SecureStore** — this is bulk/structured queue data, not a credential; SecureStore (used for auth tokens, see "Mobile app implementation notes" above) has small per-item size expectations and isn't the right tool here.
- **Auto-flushes on reconnect** via a `NetInfo` listener registered once at module load, independent of whatever screen happens to be mounted — a driver who queues a trip-end offline and locks their phone still gets it synced the moment connectivity returns.
- **What's queued today**: trip start/end, fuel record submission. Issue reports are explicitly *not* queued — `IssueReport` has no CRUD API yet (never given its own phase in the 21-phase roadmap), so there's nothing to sync it to; the Driver experience's "Report Issue" action is deferred for the same reason (see `DriverTabNavigator.js`).

## MVP roadmap

1. Architecture *(this document)*
2. Database schema + Prisma + migrations
3. Auth (register/login/refresh/logout, bcrypt, JWT)
4. Users + RBAC middleware
5. Vehicle CRUD
6. Driver CRUD
7. Vehicle-driver assignment + business rule enforcement
8. Trip CRUD + state machine
9. GPS tracking (REST + Socket.IO ingestion)
10. Live fleet map (mobile screen)
11. Maintenance CRUD + mileage/date-based alert generation
12. Fuel records + efficiency calc
13. Notifications (push + in-app)
14. Dashboard KPIs

Post-MVP: Expenses, Documents (object storage), Geofencing, deeper Reports/Analytics, Offline sync queue, AI-ready interfaces (predictive maintenance, driver risk score, fuel anomaly detection, route optimization — interfaces only, no fake AI).
