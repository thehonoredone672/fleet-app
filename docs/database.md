# Database Design

PostgreSQL + Prisma. Schema source of truth: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma).

## ER Diagram

```
Organization 1───* User
Organization 1───* Vehicle
Organization 1───* Alert
Organization 1───* Geofence
Organization 1───* Trip

User 1───1 Driver          (only users with role DRIVER have a Driver row)
User 1───* Notification
User 1───* RefreshToken
User 1───* AuditLog        (as actor, nullable — see below)

Driver 1───* VehicleAssignment
Vehicle 1───* VehicleAssignment
  → partial unique index on (vehicleId) WHERE "isActive"
  → partial unique index on (driverId)  WHERE "isActive"
  → enforces: one active driver per vehicle, one active vehicle per driver

Vehicle 1───* Trip
Driver 1───* Trip
Trip 1───* Location          (locations tagged with tripId while on a trip)
Vehicle 1───* Location        (also written outside trips, e.g. idle pings)

Vehicle 1───* Maintenance
Vehicle 1───* FuelRecord    Driver 1───* FuelRecord
Vehicle 1───* Expense
Vehicle 1───* Document      Driver 1───* Document (exactly one of the two set)

Vehicle 1───* Alert (nullable FK)   Driver 1───* Alert (nullable FK)
Geofence 1───* GeofenceEvent        Vehicle 1───* GeofenceEvent

Trip 1───* IssueReport   Driver 1───* IssueReport   Vehicle 1───* IssueReport
```

## Why some relations diverge from a naive 1:1 mapping of the product spec

- **RefreshToken** is a table on its own (not just a JWT field) so refresh tokens can be individually revoked and rotated. Each row stores a hash of the token, never the raw value.
- **Notification vs Alert**: `Alert` is the operational event ("this vehicle's insurance expires in 7 days"); `Notification` is the per-user delivery record (push + in-app inbox). One Alert can fan out to several Notifications (all fleet admins for that org). Keeping them separate avoids conflating "what happened" with "who was told."
- **Geofence / GeofenceEvent / IssueReport** were implied by the product spec (§19, §24) but not listed as explicit entities — added here since geofencing and driver issue reports can't be modeled with the listed tables alone.
- **Location.clientId** is a client-generated UUID used to dedupe GPS points that get retried or replayed from the offline sync queue — without it, a flaky connection would produce duplicate rows for the same point.
- **User.pushToken** (added Phase 16, not in the original spec's entity list) — the Expo push token for the device currently signed in, single-device MVP scope. Living directly on `User` rather than a separate `PushToken` table was a deliberate simplification: multi-device fan-out would need its own table, but nothing in the product spec asks for it yet.

## Cascade rules

Two different deletion philosophies apply, deliberately:

| Relation | Rule | Why |
|---|---|---|
| Organization → User/Vehicle/Alert/Geofence/Trip | `Cascade` | Deleting a tenant deletes its data — org deletion is a rare, deliberate admin action. |
| User → Driver/Notification/RefreshToken | `Cascade` | These are owned 1:1 or purely personal to the user. |
| Vehicle/Driver → **Trip, VehicleAssignment, Maintenance, FuelRecord, Expense, IssueReport** | `Restrict` | These are business/historical records. In practice vehicles and drivers are **soft-deleted** (status → `RETIRED`/`INACTIVE`), never hard-deleted, so this Restrict is a safety net against accidental `DELETE` calls wiping history. |
| Vehicle → Location, GeofenceEvent | `Cascade` | Raw telemetry — acceptable to lose if a vehicle record is ever actually purged (admin-only, rare). |
| Vehicle/Driver → Document, Alert | `Cascade` | Document and Alert records are meaningless without their subject. |
| AuditLog.userId | nullable FK, `SetNull` | The audit trail must survive even if the acting user is later deleted. |

## Manual step: partial unique indexes

Prisma's schema language has no `WHERE` clause on `@@unique`/`@@index`, so the "one active assignment per vehicle/driver" rule can't be expressed directly in `schema.prisma`. It's enforced with two partial unique indexes added via raw SQL, once you have a live database. **This is now load-bearing**: Phase 7 (`src/services/assignmentService.js`) ships an application-level check-then-create guard, but that alone has a race window between two concurrent requests — the index below is the actual guarantee, not just a defense-in-depth extra. Apply it before relying on assignment uniqueness in anything beyond local single-user testing.

```bash
npx prisma migrate dev --name init
npx prisma migrate dev --create-only --name partial_unique_assignments
```

Then edit the generated (empty) `prisma/migrations/<timestamp>_partial_unique_assignments/migration.sql` to:

```sql
CREATE UNIQUE INDEX "vehicle_assignments_active_vehicle_key"
  ON "vehicle_assignments" ("vehicleId")
  WHERE "isActive" = true;

CREATE UNIQUE INDEX "vehicle_assignments_active_driver_key"
  ON "vehicle_assignments" ("driverId")
  WHERE "isActive" = true;
```

Then apply it:

```bash
npx prisma migrate dev
```

This is also enforced at the service layer (Phase 7) so the API returns a clean `409 Conflict` instead of surfacing a raw Postgres constraint error — the DB index is the last line of defense, not the primary UX.

## Document ownership constraint

`Document.vehicleId` and `Document.driverId` are both nullable because a document belongs to exactly one of the two. Postgres `CHECK` constraints aren't portable through Prisma's schema DSL either, so this is validated in the `documentService` before insert (Phase 14) — reject if both or neither are set.
