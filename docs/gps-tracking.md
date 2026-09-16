# GPS Tracking

## Two ingestion paths, one service

```
Driver device
   ├─ Socket.IO 'vehicle:location' event  (primary — live push)
   └─ POST /api/v1/location                (fallback — offline sync, batched)
                    │
                    ▼
          locationService.ingest()
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   Location table       Socket.IO broadcast
   (createMany,         to org:{orgId}:fleet
   skipDuplicates)       ('vehicle:location')
```

Both paths call the same `locationService.ingest()` — the business rules (which vehicle a driver may report for, dedup, validation) run exactly once regardless of transport. Socket.IO is used when the driver's device has a live connection; the REST endpoint accepts a single point *or* a batch, which is what the mobile app's offline queue flushes through on reconnect.

## Authorization model

- **Never derive the driver from the payload.** Both the REST body and the Socket.IO event schema (`src/validators/locationValidators.js`) have no `driverId` field — the submitting driver is always the authenticated user (`req.user` / `socket.data.user`).
- The submitted `vehicleId` is cross-checked against the driver's actual **active** `VehicleAssignment`. A mismatch is rejected with `403`, not silently corrected or dropped — a client sending the wrong `vehicleId` is a bug worth surfacing, not hiding.
- Only role `DRIVER` may ingest location at all (`403` otherwise). There is no dispatcher-override path for location (unlike trip start/pause/resume/end) — a manager doesn't have a phone physically in the vehicle.
- Socket.IO connections authenticate via `socket.handshake.auth.token` (a JWT access token), verified and re-checked against the database on every connection — the same pattern as the `authenticate` HTTP middleware (`src/sockets/index.js`). An unauthenticated or deactivated-account connection is rejected before it can join any room; **no client subscribes to fleet data without a valid, still-active session.**
- Every authenticated socket joins one room, `org:{organizationId}:fleet` (`src/sockets/rooms.js`) — drivers emit into it, managers/viewers passively receive broadcasts from it. There's no per-vehicle room; at fleet sizes where that becomes a real filtering concern, the client filters client-side (see Scaling below).

## Deduplication

Every point may carry a client-generated `clientId` (a UUID, or any client-chosen unique string). It's stored as a `@unique` column on `Location`. A batch insert uses `createMany({ skipDuplicates: true })`, which relies on that unique constraint to silently drop any point whose `clientId` has already been stored — this is what makes retried or replayed offline-sync batches idempotent: if a batch partially succeeds and the client retries the whole thing, already-stored points are skipped rather than duplicated. Points without a `clientId` are never treated as duplicates of each other (Postgres unique indexes never match on `NULL`).

## Tracking interval policy (client-side)

The backend accepts points as fast as a client sends them — interval throttling is a **mobile-app** concern, not enforced server-side in this phase (see docs/architecture.md#gps-tracking for the target cadence: ~15s during an active trip, ~3min idle, OS-driven significant-location-change when backgrounded). The reasoning: the backend can't distinguish "a badly-configured client hammering the endpoint" from "a legitimate burst of queued offline points being flushed after reconnect" — the batch endpoint's whole purpose is to accept many points from one gap in connectivity at once. Per-vehicle rate limiting could be added later (e.g. in the BullMQ background-job layer once that lands) if abuse becomes a real concern; it isn't implemented speculatively here.

## Degraded conditions

| Condition | Behavior |
|---|---|
| No active assignment | `400` — the driver has no vehicle to report for |
| `vehicleId` doesn't match the active assignment | `403` |
| Bad/missing JWT on socket connect | Connection rejected (`connect_error`), never joins a room |
| Duplicate `clientId` | Silently deduped, not an error — response still `201`/ack `success: true` with `accepted` reflecting how many were actually new |
| Network loss on the driver's device | Out of this API's control — the mobile app is responsible for the offline queue and retrying via the batch REST endpoint on reconnect |

## Geofencing (Phase 17)

Every accepted point is also checked against the driver's org's active geofences (`geofenceService.checkGeofenceTransitions`, called from `locationService.ingest` after the points are stored). An entry/exit transition broadcasts `geofence:event` to the same `org:{orgId}:fleet` Socket.IO room as `vehicle:location` — a manager's Live Map subscribes to both. Full detail: [docs/api.md#geofences](api.md#geofences--apiv1geofences).

## Reading location data

- `GET /api/v1/vehicles/:id/location` — the single most recent point for one vehicle (`prisma.location.findFirst`, ordered by `timestamp desc` — cheap given the `(vehicleId, timestamp DESC)` index from Phase 2).
- `GET /api/v1/fleet/live` — one row per vehicle with its most recent point, for the Live Map's cold-load before the socket connects (Phase 10). Implemented as a single `SELECT DISTINCT ON ("vehicleId") ... ORDER BY "vehicleId", "timestamp" DESC` raw query (`src/services/fleetService.js`) rather than one query per vehicle — an N+1 loop works for a demo fleet but not for the 10 → 10,000 vehicle scaling target in docs/architecture.md, so it's done the scalable way from the start.

## Not yet implemented (tracked for later phases)

- Vehicle-offline detection (a background job flags a vehicle `OFFLINE` if silent for N minutes during an active trip) — needs the BullMQ job infrastructure from a later phase.
- Location retention/rollup (downsample raw points older than N days) — noted as a future need in docs/database.md, not required at current scale.
- Trip-route replay (full location history for a completed trip) — the Live Map (Phase 10) and Reports (later) will likely want this; today only the latest point is queryable.
