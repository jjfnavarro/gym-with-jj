# Mobile workout UI pass

The live workout and rest timer are the priority for this iteration. The coral, plum and cream identity is retained.

## Changes

- Working-set weight/reps use larger 52px-tall fields, larger numbers and legible previous-performance values. Default rows dedicate space to logging; Edit sets reveals removal and warm-up controls. Destructive removal still needs confirmation.
- Session progress stays in a sticky toolbar with pause/resume and a Finish shortcut. The shortcut opens the same explicit confirmation as the action at the end of the workout.
- Finish confirmation and other phone dialogs use bottom sheets with 48px action buttons and safe-area padding. Radix keyboard/focus behavior is preserved.
- The rest timer is a compact dock by default, with pause/resume available immediately. Expand it for ±15 seconds, skip and duration selection. Content padding follows the timer's measured height, so the last page controls can scroll above it.
- Text, notes, exercise headings and touch targets are larger on phones. Navigation labels are easier to read. Plum text on coral mobile Finish actions has a calculated 5.09:1 text/background contrast ratio, compared with 3.20:1 for white on that coral.
- UUID creation uses native `crypto.randomUUID` where available and cryptographic `getRandomValues` for local-network HTTP previews. This fixes starting/editing workouts at a phone's LAN URL without using weak random identifiers. PWA installation and service-worker offline features still need HTTPS outside localhost.

## Verification

- Strict TypeScript and production build passed.
- 26 unit/component tests and 15 real PostgreSQL integration tests passed.
- All 10 mobile/desktop browser tests passed. The live form was checked at 360, 390 and 430px, with no horizontal overflow and at least 60px-wide, 48px-tall weight fields. Actual field height is 52px.
- Tests exercise Edit sets, confirmed removal, the compact timer (under 90px tall), expanded ±15-second controls, pause/resume/expiry, the sticky Finish shortcut and bottom-sheet placement. Existing offline reload/synchronization and history flows also passed.
- Two additional workout browser flows passed through the LAN HTTP address, verifying the UUID compatibility path using the real backend. A local preview account's history was not used for these tests; browser tests use the disposable `_test` database.

Screenshots are in `docs/screenshots/`, including `mobile-chromium-workout-focused.png`, `mobile-chromium-timer-expanded.png` and `mobile-chromium-finish-sheet.png`. Physical device Safari, keyboard behavior and background alarm delivery still need device testing.

To repeat the LAN checks, set `TEST_DATABASE_URL` to an isolated database ending in `_test`, build the app, and then:

```powershell
$env:E2E_BASE_URL = 'http://YOUR_LAN_IP:4173'
npm.cmd run test:e2e -- --grep 'owner creates'
```

The localhost default remains unchanged when `E2E_BASE_URL` is absent. The Docker image verification in the original report predates this UI pass; Railway will build the current source through the checked-in Dockerfile.
