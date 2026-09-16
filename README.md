# Fleet Management Platform

A production-oriented fleet management system: mobile app (managers + drivers), REST API, real-time GPS tracking, and reporting.

Build status: **Phase 19 of 21 complete** — offline synchronization: a persistent, AsyncStorage-backed mobile action queue that auto-flushes on reconnect, distinguishing "network unreachable" (keep the item, retry later) from "the server actually rejected this" (drop it, retrying won't help) — plus real dedup so a retried-after-lost-response submission never double-books (trip start/end lean on the existing state-machine finality checks; fuel records get a new `clientId` field, the same pattern GPS location ingestion already used). This is also the first phase to build out the Driver mobile experience for real: a Home screen (assigned vehicle, current trip, Start/End Trip, today's distance/fuel cost) and a fuel-entry form, both wired through the queue, with a visible pending-sync indicator. See [docs/architecture.md](docs/architecture.md#offline-sync-phase-19) for the queue design, [docs/api.md](docs/api.md#dashboard--reports) for the Phase 18 report shapes, and [docs/gps-tracking.md](docs/gps-tracking.md#geofencing-phase-17) for the geofencing design.

Mobile screens are added incrementally alongside the backend area they belong to rather than all at once — see `mobile/src/navigation/*TabNavigator.js` for what's live today: managers get Dashboard, Live Map, and Profile; drivers get Home (trip start/end, offline-queued), Add Fuel, and Profile. Maintenance's, expenses', documents', and alerts' own manager-side mobile screens are still deferred until the Vehicles/Drivers list/detail screens exist, since those naturally live nested under those views (§12/§13) rather than as standalone tabs today; Trip detail, vehicle-detail-for-driver, and Report Issue (no backend API yet) are the remaining gaps on the Driver side.

## Tech stack

- **Mobile**: React Native + Expo, JavaScript (no TypeScript), React Navigation, TanStack Query, Zustand, `expo-location`, `expo-notifications`, `expo-secure-store`
- **Backend**: Node.js + Express, JavaScript, controller → service → repository (Prisma) layering
- **Database**: PostgreSQL via Prisma ORM
- **Real-time**: Socket.IO
- **Background jobs**: BullMQ + Redis
- **File storage**: pluggable (S3 / Cloudinary) behind `storageService.js`

Full rationale for each choice: [docs/architecture.md](docs/architecture.md).

## Repository layout

```
fleet-management/
├── backend/           Express API, Prisma schema, tests
├── mobile/            Expo app (added starting Phase 3+)
├── docs/              Architecture, database, API, GPS, security, deployment docs
└── docker-compose.yml Local Postgres + Redis for development
```

## Getting started (backend)

Requires Node 18+, and a reachable PostgreSQL instance.

```bash
cd backend
npm install
cp .env.example .env      # then fill in real values
```

Start local Postgres + Redis with Docker (or point `DATABASE_URL` at Neon/RDS/etc.):

```bash
docker compose up -d
```

Run migrations and generate the Prisma client:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

The `VehicleAssignment` table needs one manual follow-up migration for a constraint Prisma's schema language can't express directly — see [docs/database.md](docs/database.md#manual-step-partial-unique-indexes).

Seed demo data (one organization + one SUPER_ADMIN user):

```bash
npx prisma db seed
```

Run the API:

```bash
npm run dev      # nodemon, http://localhost:4000
```

Run tests (auth flow integration tests are `describe.skip`'d until `DATABASE_URL` points at a real database — see [docs/api.md](docs/api.md) and `tests/authFlow.integration.test.js`):

```bash
npm test
```

## Getting started (mobile)

Requires the backend running (see above) and either Expo Go on a physical device or an Android/iOS emulator.

```bash
cd mobile
npm install
cp .env.example .env      # defaults already point at localhost:4000
npm start                  # opens Expo Dev Tools / QR code
```

On a physical device, `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_SOCKET_URL` in `.env` must point at your machine's LAN IP, not `localhost` (the device can't resolve your computer's localhost). Log in with the seeded demo admin (`npx prisma db seed` in `backend/`) or register a new organization from the backend directly — there's no mobile registration screen yet (see `mobile/src/navigation/AuthStack.js`).

react-native-maps needs no extra setup for Expo Go / development; production app-store builds need Google Maps API keys — see `mobile/.env.example` and `mobile/app.config.js`.

## Documentation

- [docs/architecture.md](docs/architecture.md) — system architecture, tech decisions, security & GPS tracking design
- [docs/database.md](docs/database.md) — ER diagram, cascade rules, constraints
- [docs/api.md](docs/api.md) — endpoint reference (auth + users so far)
- [docs/security.md](docs/security.md) — password/token policy, rate limiting, audit trail
- [docs/gps-tracking.md](docs/gps-tracking.md) — ingestion paths, authorization model, dedup, scaling
- `docs/deployment.md` — added when the deployment phase lands

## Development phases

This project is built incrementally, phase by phase (auth → RBAC → vehicles → drivers → trips → GPS → live map → maintenance → fuel → expenses → documents → alerts → notifications → geofencing → reports → offline sync → testing → deployment). Each phase's status (files touched, APIs added, tests run) is reported as it completes.
