# Implementation and verification log

The project uses npm workspaces with strict shared Zod contracts. Templates are relational; session exercises, targets, sets, cardio and names are independent immutable snapshots. All load is canonical kilograms in PostgreSQL Decimal fields.

Phases implemented: 1 workspace/design foundation; 2 database/auth; 3 templates/library; 4 live workout/timer; 5 history/analytics; 6 offline/PWA; 7 QA/deployment. Strict TypeScript, calculation tests, PostgreSQL lifecycle tests, browser flows, production builds and container checks are recorded in [VERIFICATION.md](VERIFICATION.md).

## Calculation rules

Working-set progress excludes warm-ups and exercises explicitly skipped by the user. Adding/removing sets changes the denominator. A zero-set workout is 0%. Finishing is always an explicit confirmed action and may finish a partial workout.

Volume is completed working-set external kilograms × actual reps. It excludes skipped, bodyweight and assistance exercises. Weighted bodyweight volume is added external load only. For dumbbells log the combined external load; unilateral reps are per leg as noted in the template. Machine loads are only comparable within the same exercise and machine setup.

PR: greatest external load, ties broken by actual reps; bodyweight: most reps; assistance: least assistance, ties broken by reps. PRs are scoped to exercise ID and load mode. Estimated 1RM uses Epley (weight × (1 + reps/30)) for external-load sets with 1–12 reps only. It is an estimate, not a tested 1RM. Bodyweight, weighted-bodyweight and assistance do not receive estimated 1RM values because body mass is not recorded.

## Offline and conflicts

Dexie stores each active workout change before network synchronization. Session and set IDs are client-generated UUIDs. Each local revision receives a mutation UUID. The server atomically compares the expected version, deduplicates an identical retry, and saves the complete relational snapshot in one transaction. An acknowledgement only clears the exact local revision sent; edits made in flight remain queued. Writes to the same owner's sessions are serialized with a PostgreSQL advisory transaction lock. One active workout per owner is enforced server-side.

A version conflict stops synchronization for that local session and retains it for JSON recovery export. The server copy is not overwritten. A user may explicitly discard the conflicting local copy and reload the server version. Completed server sets are immutable; History notes use a separate version-checked endpoint. Deleted sessions have server tombstones, preventing stale devices from recreating them. Online bootstrap respects dirty local records. Offline templates/settings are cached read-only; active workout edits remain available offline. Signing out clears local personal data after queued work has synced or after explicit confirmation of discard.

Only static application assets enter the service-worker cache. Auth and API responses use no-store. Offline cached personal history resides in IndexedDB on the signed-in device; device access controls remain important. Server cookies expire after seven days. An expired login does not delete queued workouts; reconnect and sign in to sync them.

## Timer limits

There is one persisted end-timestamp timer per browser installation. Pause saves remaining milliseconds; resume creates a new end timestamp. Visibility changes and regular foreground ticks recalculate from wall-clock time. Foreground audio requires a user gesture and notifications require an explicit Settings action. Mobile browsers may suspend JavaScript on lock; alarms cannot be guaranteed while locked. Keep the app open for reliable cues. Notification alerts are issued through the registered service worker when available, after the app observes expiry; the worker does not schedule background alarms.
