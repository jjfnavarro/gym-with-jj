# GYM WITH JJ

A mobile-first, owner-only workout journal with a real Express/PostgreSQL backend, offline workout logging, a persistent rest timer, and a warm coral/plum visual system. Built for a personal Railway deployment, with a single application container and a separate persistent PostgreSQL service.

The latest [mobile workout UI pass](docs/MOBILE-UI.md) adds larger set inputs, a sticky Finish action, expandable compact timer controls and phone bottom sheets.

## What’s implemented

- Owner login with Argon2id, server-side expiring sessions, HttpOnly/SameSite cookies, CSRF tokens, origin checks and login rate limiting. No registration route or default account.
- Compact Home with start/resume actions, weekly workout calendar and a recent-workout link; desktop sidebar and mobile bottom navigation.
- Editable, duplicable, archivable and deletable splits; independently editable/reorderable days, rest days, exercise order, working/warm-up sets, rep ranges, alternatives, notes and rest prescriptions.
- Searchable exercise library and custom exercises with external, bodyweight, weighted-bodyweight and assistance load modes.
- The complete requested Upper/Lower starter, seeded only through owner setup and safe to seed repeatedly. Four optional finishers start at the lower ends of the requested ranges (15 or 10 minutes); duration is editable per session/day.
- Live per-set actual load/reps, previous completed values, completion/undo, editable completed sets, add/remove working or warm-up sets, skip/restore exercises, pause/resume/abandon, notes and explicit finish confirmation.
- Working-set completion ring; warm-ups and skipped exercises are excluded. Zero planned sets produces 0%, with an explicit finish action.
- Timestamp-based persisted rest countdown, pause/resume, ±15 seconds, preset durations, custom seconds via each exercise’s rest control, supported foreground audio/vibration and opt-in notifications.
- Separate treadmill time, speed, incline and completion; session finish summary, searchable/date/split-filtered history, previous-set comparisons, note edits and confirmed deletion.
- Real Recharts exercise load, estimated 1RM, external volume and weekly frequency charts. Bodyweight/assistance charts use appropriate metrics and do not fabricate body mass or 1RM.
- Installable PWA, original SVG/PNG icons, precached application shell, IndexedDB autosave, offline session edits, automatic queued synchronization, stable UUIDs, retry deduplication, conflict review and recovery download.
- Light/default and dark themes, kg/lb conversion, Asia/Manila default date display, rest/audio/vibration/treadmill preferences, validated merge-only JSON import and JSON/CSV history export.
- Strict TypeScript, unit/component tests, real PostgreSQL integration tests, Playwright mobile/desktop flows, controlled-clock timer tests and offline refresh tests.

## Stack and layout

Node **24 LTS** (24.11+), npm workspaces, React **19.3.1**, Vite **8.3.7**, TypeScript **5.9**, Tailwind **4.3.5**, shadcn-style source components with Radix/CVA, Lucide, React Router, TanStack Query, React Hook Form/Zod **4.6.7**, Recharts, Dexie, vite-plugin-pwa **2.0.0**, Express **5.3.0**, Prisma Client/CLI/pg adapter **7.10.1**, PostgreSQL **16+**, Argon2id, Vitest **5.1.0**, Testing Library and Playwright. `package-lock.json` records every exact installed version. Prisma 8 is a release candidate at implementation time and is intentionally not used.

```text
apps/
  api/
    prisma/schema.prisma          Relational schema
    prisma/migrations/            Initial schema + integrity constraints
    prisma.config.ts
    src/app.ts                    API, authentication, authorization, sync
    src/data.ts                   Snapshot mapping and template persistence
    src/seed.ts                    Idempotent editable starter
    src/owner.ts                   One-time secure account creation
    src/server.ts                  Listener and graceful shutdown
  web/
    public/                       Original SVG and install icons
    src/components/ui/            Button and accessible Radix dialog
    src/App.tsx                   Shell, dashboard, workout selector
    src/workouts.tsx              Split editor and exercise library
    src/workout.tsx               Live workout
    src/timer.tsx                 Persistent rest timer and progress ring
    src/history.tsx               History, summaries and analytics
    src/settings.tsx              Preferences, backups and recovery
    src/lib.ts                    IndexedDB and synchronization
    src/context.tsx               Authentication and cached data state
    src/styles.css                Responsive design system
packages/shared/src/index.ts      Zod contracts and calculation functions
tests/                            Unit, UI, PostgreSQL and browser tests
scripts/                          API bundler and icon generation
docs/IMPLEMENTATION.md            Calculations, conflicts and timer contract
Dockerfile / railway.json         Single-service application deployment
compose.yaml                      Optional persistent local PostgreSQL
```

## Run locally

1. Install Node 24 LTS and PostgreSQL 16+ (or Docker). Copy `.env.example` to `.env`. Do not commit `.env`.
2. Set a random `POSTGRES_PASSWORD` if using Compose, and set `DATABASE_URL` to match it. URL-encode special characters in the URL password. The optional Compose database binds only to localhost port **5433** and persists in its named Docker volume.

```sh
docker compose up -d postgres
npm ci
npm run db:generate
npm run db:migrate
npm run build
```

3. Set `OWNER_EMAIL`, `OWNER_NAME` and a unique `OWNER_PASSWORD` of at least 12 characters in the local ignored `.env`, then run:

```sh
npm run owner:create
```

This command creates the single owner and the editable starter in one transaction. It refuses to replace an existing owner. Remove `OWNER_PASSWORD` from `.env` immediately afterwards. No password is printed or shipped in frontend code. A random opaque session cookie is stored as a SHA-256 hash in PostgreSQL; no shared session secret is required.

```sh
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to Express on port 3000. On Windows PowerShell where npm.ps1 is disabled, use **`npm.cmd`** in place of `npm`; do not change your execution policy just for this project.

To exercise the built PWA locally, stop development servers, set `APP_ORIGIN=http://localhost:3000`, then run `npm start` and visit that exact URL. `npm start` reads environment variables provided by the host; for a local `.env` use `node --env-file=.env apps/api/dist/server.js`. Service workers are enabled in production builds, not the Vite development server. Installations require HTTPS outside localhost. For development over a phone’s LAN address, change `APP_ORIGIN` to that exact frontend origin; HTTPS is needed to test installation.

## Database design and integrity

```mermaid
erDiagram
  User ||--|| UserSettings : preferences
  User ||--o{ AuthSession : authenticates
  User ||--o{ WorkoutSplit : owns
  WorkoutSplit ||--o{ SplitDay : orders
  SplitDay ||--o{ SplitDayExercise : prescribes
  Exercise ||--o{ SplitDayExercise : defines
  User ||--o{ Exercise : owns
  User ||--o{ WorkoutSession : logs
  WorkoutSession ||--o{ WorkoutSessionExercise : snapshots
  WorkoutSessionExercise ||--o{ WorkoutSet : records
  WorkoutSession ||--o{ CardioEntry : tracks
```

UUID primary keys, UTC `timestamptz` timestamps, precise `Decimal(9,3)` canonical kilogram loads, ordered relations, indexes, foreign keys and SQL integrity checks protect the data. Settings are a validated JSON preference document. The owner singleton has both a unique key and a database check. A partial unique index permits one live workout per owner. Templates cascade to their days/prescriptions; referenced global exercises are archived instead of destructively removed. Session exercise/template IDs are provenance, with independent snapshots rather than destructive template foreign keys.

Session saves replace relational child rows atomically under an owner-specific transaction lock and expected version. Retries use a mutation UUID. Finalized session results cannot be overwritten by sync; only version-checked note edits and explicit deletion are allowed. Deletions retain tombstones so stale offline devices cannot resurrect them. Local edits made while a save is in flight stay queued. A conflicting local copy is retained with recovery export and an explicit “Use server copy” action.

Calculation definitions and conflict details are in [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

## Tests

```sh
npm run typecheck
npm test
```

Integration and E2E suites require an **isolated, disposable** PostgreSQL database whose name ends in `_test`. Both reset owner data in that database. Never point these suites at your personal/production database. Apply migrations to the test database first; migration commands read `DATABASE_URL`, tests read `TEST_DATABASE_URL`.

PowerShell example, with a database you have already created:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://YOUR_TEST_USER:YOUR_PASSWORD@localhost:5433/gym_with_jj_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm.cmd run db:migrate
npm.cmd run test:integration
npm.cmd exec -- playwright install chromium webkit
npm.cmd run test:e2e
```

E2E starts the built Express service on port 4173. Run `npm run build` first. It creates a fresh owner with a generated test-only password; no persistent test credential is embedded in source. Playwright covers login → custom split/day/exercise prescription → logging → timer pause/resume/expiry → finishing → history and charts, plus real offline reload/reconnection. View failure traces with `npx playwright show-report`. Test screenshots are under `docs/screenshots/`.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for actual results and limits, and [docs/VERSIONS.md](docs/VERSIONS.md) for the full installed-version table.

See [docs/UI-PREFERENCES.md](docs/UI-PREFERENCES.md) for the simplified mobile interface, header controls and muscle-specific set/exercise rest timers.

## Railway deployment

The final audit, automated GitHub checks and deployment variables are summarized in [docs/RELEASE-READINESS.md](docs/RELEASE-READINESS.md). Run `node scripts/verify-container.mjs` after building the image to repeat the isolated production-container check.

1. Push this project to your own GitHub repository. In Railway create a project, add **PostgreSQL**, then create an application service connected to that repository. Keep the application root at the repository root. Railway detects the multi-stage Dockerfile.
2. Generate the application’s public HTTPS domain under Networking. Set its service variables:

| Variable       | Value                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Reference the PostgreSQL service’s `DATABASE_URL`, usually `${{Postgres.DATABASE_URL}}` (use your actual service name). |
| `APP_ORIGIN`   | Exact public origin, e.g. `https://your-app.up.railway.app`, **without** a trailing slash.                              |
| `NODE_ENV`     | `production` (also set by the Docker image).                                                                            |
| `PORT`         | Railway supplies this. Express binds it on `0.0.0.0`.                                                                   |

No frontend environment variables or session signing secrets are needed. Do not expose the database or owner password through `VITE_*` variables.

3. Deploy. `railway.json` runs **`npm run db:migrate`** as a controlled pre-deploy command, then starts the app and checks `/api/health`. The Prisma CLI is deliberately retained as a production dependency so that migrations work in the final image. A failing migration blocks deployment. It never runs `db push`, `migrate reset`, or destructive seed commands. Review migrations and take a database backup before schema changes. These behaviors follow Railway’s [pre-deploy documentation](https://docs.railway.com/deployments/pre-deploy-command) and [healthcheck documentation](https://docs.railway.com/deployments/healthchecks).
4. **One-time owner creation:** use Railway’s service shell / SSH to the application container. Supply `OWNER_EMAIL`, `OWNER_NAME`, and `OWNER_PASSWORD` as temporary environment variables through your secret-management UI, run **`node apps/api/dist/owner.js`** once in the application container, then remove the temporary password variable. Do not add owner creation to the pre-deploy command: it intentionally fails if the owner exists. If the platform shell is unavailable, run the built owner command from a trusted machine using the PostgreSQL service’s external connection URL temporarily; private database hostnames cannot be reached from your laptop. Avoid passwords in command history.
5. Open the HTTPS domain, sign in, and install from your phone’s browser. Verify a completed workout appears in History and that Settings shows no pending sync. Keep the PostgreSQL service and its persistent storage; application redeployments require no local filesystem volume. Enable database backups in Railway. See its [PostgreSQL documentation](https://docs.railway.com/databases/postgresql).

To validate the container yourself:

```sh
docker build -t gym-with-jj .
docker run --rm --env-file .env -e NODE_ENV=production -e APP_ORIGIN=https://YOUR_DOMAIN -p 3000:3000 gym-with-jj
```

The container’s `DATABASE_URL` must be reachable from inside Docker (a host-local database may require `host.docker.internal`), and your HTTPS proxy must preserve the public origin. The non-root runtime serves the built frontend and `/api` from one process. API paths never fall back to the SPA. Logs are structured JSON with cookie headers redacted; shutdown closes HTTP connections and the Prisma pool.

## Operational limits and useful next steps

- Locked/suspended mobile browsers cannot guarantee alarms. Audio is unlocked by a workout gesture; notifications are issued through the registered service worker when the app observes expiry. Keep the app in the foreground for reliable cues.
- Temporary offline workout logging works after a successful sign-in/cache on that device. Templates and preferences are read-only offline. Cached personal history is stored in IndexedDB; signing out online clears it. Browser data clearing or storage eviction removes local-only pending work, so allow device storage and sync regularly.
- Imports are validated, transactional **merge-only** backups. Existing records, tombstones and preferences are preserved. Exported active workouts are handled separately as conflict recovery copies and cannot be imported into finalized history without first completing them. CSV exports strength sets; full JSON includes cardio.
- Body mass is not tracked. Bodyweight progression is reps, assistance progression is assistance removed, and weighted bodyweight tracks added load. Estimated 1RM is shown only for eligible external-load exercises. Keep machine setup and dumbbell load conventions consistent.
- Light/dark modes and responsive layouts are implemented; this session’s browser verification is Chromium-based. Test installation, audio and vibration on your own iPhone/Android device before depending on gym alerts.
- Future improvements: Safari/WebKit device CI, automated encrypted backups, owner password recovery/rotation tooling, conflict comparison/merge UI, body-mass-aware analytics, history pagination for many years of data, and drag-and-drop reordering (accessible up/down controls work now).

No Railway account has been connected and no public deployment has been created by this implementation. The files, migrations and exact remaining manual setup are ready here.
