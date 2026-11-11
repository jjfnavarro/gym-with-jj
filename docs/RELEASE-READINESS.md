# Railway release readiness

Release review: 12 November 2026, Asia/Manila.

Verified for this release: production build and strict TypeScript; 37 unit/component/HTTP-boundary tests; 15 real PostgreSQL integration tests; all 18 browser tests, including mobile WebKit and cross-tab alarm dismissal; a rebuilt Linux production image with three fresh migrations, an idempotent migration rerun, a non-root runtime and successful Docker HEALTHCHECK. The container smoke also checked actual frontend assets and update-safe response headers. Temporary container-test resources were removed; the existing phone preview/database were retained.

## Changes from the final audit

- HTML and the service worker revalidate on every deployment; fingerprinted Vite assets use immutable caching. Missing asset requests return 404 instead of HTML, avoiding misleading JavaScript errors after releases.
- Invalid APP_ORIGIN values fail at startup with a clear message. Use an exact public HTTPS origin, without a path or trailing slash.
- Oversized JSON requests return an actionable 413 response instead of an internal server error.
- Dismissing or replacing a timer in another tab stops the current tab's repeating alarm.
- Safari sound recovery resets the media pipeline after a rejected play and keeps the retry control visible until playback is actually accepted. CI uses a pinned Ubuntu 24.04 runner for repeatable browser/media dependencies.
- GitHub Actions verifies builds, runtime dependency advisories, database migrations, unit/component/API tests, browser flows and the Linux production image. Action versions are pinned to official release commits and workflow permissions are read-only.
- `scripts/verify-container.mjs` creates an isolated PostgreSQL container, applies all migrations twice, tests the production application and verifies its non-root user and Docker health check. It removes its own temporary containers/network afterward. It never uses the personal preview database.

## Deployment configuration

Connect the GitHub repository to a Railway application service with the repository root as its root directory. Keep the existing Dockerfile and railway.json. Add a PostgreSQL service and set:

| Variable     | Production value                                        |
| ------------ | ------------------------------------------------------- |
| DATABASE_URL | Reference the Railway PostgreSQL service's DATABASE_URL |
| APP_ORIGIN   | The application's generated public HTTPS origin         |
| NODE_ENV     | production (already set in the Docker image)            |
| PORT         | Railway supplies it; the server binds 0.0.0.0           |

The pre-deploy command applies migrations and blocks a failed release. The readiness endpoint is `/api/health`; it checks PostgreSQL. No frontend environment variables or shared session secrets are needed.

After the first deployment, create the owner once using temporary OWNER_EMAIL, OWNER_NAME and OWNER_PASSWORD service variables and `node apps/api/dist/owner.js` in the application container. Use a new production password of at least 12 characters, then remove OWNER_PASSWORD. The command refuses to replace an existing owner. Do not put owner creation in a recurring deployment command.

The local preview database remains separate from Railway. Export completed workouts from local Settings before moving to the cloud and import the JSON backup after creating the cloud owner. Imports merge new IDs and preserve existing records/preferences; configure preferences and any edits to already-existing starter templates explicitly in the cloud. Pending active workouts must finish and synchronize before backup import.

Railway CLI access was not authenticated during this review. No cloud resources or deployment were created. Connect/sign in to Railway before performing the steps above.

## Dependency limits

The production dependency audit reports zero advisories. The full development tree has six advisories (two low, four moderate) in the Workbox build chain. npm's proposed fixes downgrade incompatible top-level build packages; they were not applied. These build tools are excluded from the final production image. This is a package audit, not a complete operating-system image scan or penetration test.

Timer sound and visual alarms work while the web app is running. iOS may suspend a locked/backgrounded browser, and Safari does not expose web vibration. These platform limits remain documented in [TIMER-ALERTS.md](TIMER-ALERTS.md).

## Repeat the release checks

Use a disposable PostgreSQL database ending in `_test` for integration and browser tests, with migrations applied first. The tracked GitHub workflow contains the full sequence.

```sh
npm ci
npm run build
npm test
npm run test:integration
npm run test:e2e
docker build -t gym-with-jj:local .
node scripts/verify-container.mjs
```

`verify-container.mjs` accepts SMOKE_IMAGE and SMOKE_PORT when an alternate image name or localhost port is needed. API and browser tests require TEST_DATABASE_URL. Migration commands use DATABASE_URL. Windows PowerShell users can run npm.cmd.
