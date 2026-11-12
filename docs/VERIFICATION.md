# Verification record

Shared dumbbell background, 12 November 2026: production build, strict TypeScript, formatting and diff checks passed. A read-only LAN-preview review covered 11 screens (login, Home, workouts, library, history, workout detail, progress, Settings, split editor, missing-workout state and unknown route). All 110 layout combinations passed: Chromium at 360, 390, 430 and 1440px, and WebKit at 390px, each in light and dark mode. No horizontal overflow or browser errors occurred; the background remained behind content and outside pointer/accessibility interaction. Login field focus and opening/closing the workout dialog passed in both browsers. Existing workout data and preferences were retained. The missing-workout state was used instead of creating an active session in the personal preview database.

Final release audit, 12 November 2026: **37 unit/component/HTTP-boundary tests, 15 PostgreSQL integration tests and all 18 browser tests passed**. The rebuilt production image passed fresh/idempotent migrations, non-root startup, cache/asset/API smoke checks and Docker HEALTHCHECK against isolated PostgreSQL. Runtime dependency audit: zero advisories; six known development-only build-chain advisories remain. The audit fixes, GitHub CI and exact Railway setup are recorded in [RELEASE-READINESS.md](RELEASE-READINESS.md). Earlier container and database lifecycle notes below are historical.

Home simplification, 12 November 2026: production build and strict TypeScript passed, along with all **18 browser tests (2.7 minutes)**. The suite now verifies resuming an active workout from Home and opening the latest completed workout in mobile Chromium, desktop Chromium and mobile WebKit. A separate read-only WebKit review of the LAN preview passed in light/dark themes at 360, 390 and 430px: no horizontal overflow, Home content above bottom navigation and no browser errors. Existing owner data and preferences were retained.

Treadmill checkbox fix, 12 November 2026: Finisher complete captured its checkbox value inside an asynchronous database callback, after React had restored the controlled input. The handler now captures the value during the tap, and the full label has a 52px minimum touch target. The production build and strict TypeScript passed. Three focused browser flows passed in mobile Chromium, desktop Chromium and mobile WebKit (23.1 seconds), covering completion, undo, reload persistence, the saved API value, paused/resumed controls and completed treadmill history. Tests used only the isolated test database.

Louder-alarm/pop-up follow-up, 12 November 2026: production build, strict TypeScript, **34 unit/component tests and all 15 browser tests passed**, including the muted and persistent visual alarm in mobile WebKit. See [TIMER-ALERTS.md](TIMER-ALERTS.md).

Timer-alert follow-up, 12 November 2026: the production build, strict TypeScript, **33 unit/component tests and 15 browser tests passed**, including native audio playback in mobile WebKit. The LAN preview passed a read-only WebKit sound check. See [TIMER-ALERTS.md](TIMER-ALERTS.md) for evidence and physical-device limits.

Latest mobile UI verification, 12 November 2026: strict TypeScript and the production build passed; **28 unit/component tests, 15 PostgreSQL integration tests and 12 mobile/desktop browser tests passed**. The LAN preview was checked read-only with its existing saved data. See [UI-PREFERENCES.md](UI-PREFERENCES.md) for the header, layout and separate rest-timer changes. The container results below are historical and predate this pass.

Verified on 11 November 2026, Asia/Manila, using Node 24.13.0 on Windows and a Linux Docker image. No production account or Railway credentials were used.

## Automated results

| Check                                     | Result                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Strict TypeScript, shared/API/web         | Passed                                                                     |
| Unit and React Testing Library tests      | 25 passed                                                                  |
| PostgreSQL API integration tests          | 15 passed against real PostgreSQL 16.8                                     |
| Mobile and desktop Playwright suite       | 10 passed, including sequential typing, offline reload and queued sessions |
| Vite production build                     | Passed                                                                     |
| API production bundle                     | Passed                                                                     |
| PWA manifest, service worker and icons    | Generated successfully                                                     |
| Linux multi-stage Docker build            | Passed, including final-image smoke and health checks                      |
| Migration from empty test database        | Both migrations applied successfully                                       |
| Migration command inside production image | Passed; no pending migrations on rerun                                     |
| Production dependency audit               | 0 advisories (`npm audit --omit=dev`)                                      |

## What the tests prove

- Calculations: working-set percentage, warm-up/skipped exclusions, denominator changes, zero-set behavior, timestamp countdown, pause/resume drift, workout duration, Decimal load/volume, kg/lb conversions, PR rules and strict schema validation. Cycle lengths are not capped at seven or one hundred days.
- UI: named/described accessible dialogs, disabled buttons, explicit form submission and focused input drafts surviving delayed autosave acknowledgements. The latter is a regression for a real issue found using sequential keystrokes.
- Database: owner authorization, bad-origin and missing-CSRF rejection, HttpOnly/SameSite cookies, production `Secure`/`__Host-` cookies, no-store API headers, idempotent seeding, exercise and split creation/editing/deletion, session start/log/undo/finish, retry deduplication, stale version and second-active-session rejection, historical snapshots surviving template deletion, protected completed results, version-checked note edits, backup deduplication, deletion tombstones and logout.
- Browser: owner login; split/day creation; adding and prescribing an exercise; confirmed set removal; actual typed weight/reps/notes; completion ring; controlled-clock rest start/pause/resume/expiry; confirmed finishing; real history and charts; offline reload retaining actual set values/completion; reconnect synchronization; custom secondary-muscle typing and confirmed archiving; 360px route overflow checks. The final queue test deliberately gives a later workout a smaller UUID and checks that an earlier offline finish syncs first.
- Container: non-root application startup, native password hashing availability, PostgreSQL-backed `/api/health`, static frontend and SPA routing, protected JSON API responses, no-store headers and rejected cross-origin login. `scripts/smoke-container.mjs` is the repeatable smoke check for a container exposed only on localhost port 4180 with `APP_ORIGIN=https://gym.example` and a disposable database.

## Security and verification limits

The full development dependency audit still reports **6 advisories (2 low, 4 moderate)** in the Workbox build chain (`glob`, `minimatch`, `deepmerge` and parents). These are build tools, excluded from the production image. Automatic audit remediation proposed incompatible downgrades, which were not applied. The actual production dependency audit reports zero advisories. This is an npm package audit, not a complete base-image vulnerability assessment or a penetration test.

Screenshots of mobile/desktop dashboard and live workout were generated by the browser suite and visually inspected. Mobile layouts were tested in Chromium emulation at 390px and routes at 360px; native Safari/WebKit installation, physical device vibration and audible playback were not manually verified. Browser clock tests validate countdown state, not guaranteed locked-device alarms.

No Railway deployment was attempted. Remaining user actions are creating the Railway project/services, connecting a GitHub repository, setting the database/public-origin variables and securely creating the owner. Exact steps are in the README. The temporary local PostgreSQL cluster and ignored `.local` files contain test data only, not a configured personal account.

## Final browser and container results

The final complete Playwright run passed **10/10 tests in 37 seconds**, using the built Express/PWA application against the real disposable PostgreSQL database. Both mobile and desktop projects passed all five flows. The queue-order test waits for the live screen, completed summary and synchronization before closing its browser context.

The final `gym-with-jj:local` image built successfully. Its container passed `scripts/smoke-container.mjs`, Docker reported **healthy**, its runtime user was **node**, and `npm run db:migrate` inside the production image reported **no pending migrations**. The localhost smoke container and isolated PostgreSQL cluster were stopped after verification; the existing system PostgreSQL service was not changed. The local image remains available for inspection.

No personal owner account was created. The owner creation procedure, deployment variables, architecture, schema, commands, limitations and suggested improvements are documented in `README.md`. No real credentials are embedded in source or test fixtures.

For this Windows workspace only, the ignored disposable test cluster can be restarted with:

```powershell
& 'C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe' -D '.local/pgdata' -l '.local/postgres.log' -o '-p 55432 -h 127.0.0.1' start
$env:TEST_DATABASE_URL = 'postgresql://gym_test@127.0.0.1:55432/gym_with_jj_test'
```

It uses localhost-only trust authentication for test data. It is not the database configuration for a personal or production deployment. Other machines should create a disposable `_test` database using their own PostgreSQL installation, as described in the README.
