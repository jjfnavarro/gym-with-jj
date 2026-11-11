import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const image = process.env.SMOKE_IMAGE ?? 'gym-with-jj:local';
const port = process.env.SMOKE_PORT ?? '4180';
assert.match(port, /^\d+$/);
const prefix = `gym-release-${randomBytes(5).toString('hex')}`;
const database = `${prefix}-db`;
const application = `${prefix}-app`;
const password = randomBytes(24).toString('hex');
const env = {
  ...process.env,
  POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgresql://gym:${password}@${database}:5432/gym_release_test`,
  APP_ORIGIN: 'https://gym.example',
  PORT: '3000',
  NODE_ENV: 'production',
};
const resources = [];
let networkCreated = false;
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0)
    throw new Error(
      `${result.error?.message ?? result.stderr ?? 'Docker command failed'}`.replaceAll(
        password,
        '[redacted]',
      ),
    );
  return result;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  docker(['network', 'create', prefix]);
  networkCreated = true;
  docker([
    'run',
    '-d',
    '--name',
    database,
    '--network',
    prefix,
    '--env',
    'POSTGRES_PASSWORD',
    '--env',
    'POSTGRES_USER=gym',
    '--env',
    'POSTGRES_DB=gym_release_test',
    'postgres:16-bookworm',
  ]);
  resources.push(database);
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    if (
      docker(
        ['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'gym', '-d', 'gym_release_test'],
        true,
      ).status === 0
    ) {
      ready = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(ready, 'Disposable PostgreSQL did not become ready');
  const migrationArgs = [
    'run',
    '--rm',
    '--network',
    prefix,
    '--env',
    'DATABASE_URL',
    image,
    'npm',
    'run',
    'db:migrate',
  ];
  const migrated = docker(migrationArgs).stdout;
  assert.match(migrated, /applied|No pending migrations/);
  assert.match(docker(migrationArgs).stdout, /No pending migrations/);
  console.info('Fresh database migrations passed; rerun is idempotent.');
  docker([
    'run',
    '-d',
    '--name',
    application,
    '--network',
    prefix,
    '--publish',
    `127.0.0.1:${port}:3000`,
    '--env',
    'DATABASE_URL',
    '--env',
    'APP_ORIGIN',
    '--env',
    'NODE_ENV',
    '--env',
    'PORT',
    image,
  ]);
  resources.push(application);
  const base = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).ok) {
        healthy = true;
        break;
      }
    } catch {
      /* Await startup. */
    }
    await delay(1000);
  }
  assert.ok(healthy, 'Production application did not become ready');
  assert.equal(
    docker(['inspect', '--format', '{{.Config.User}}', application]).stdout.trim(),
    'node',
  );
  const smoke = spawnSync(process.execPath, ['scripts/smoke-container.mjs'], {
    env: { ...env, SMOKE_URL: base },
    encoding: 'utf8',
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  console.info(smoke.stdout.trim());
  let dockerHealthy = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    if (
      docker(['inspect', '--format', '{{.State.Health.Status}}', application]).stdout.trim() ===
      'healthy'
    ) {
      dockerHealthy = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(dockerHealthy, 'Docker HEALTHCHECK did not report healthy');
  console.info(
    'Production image verified: non-root runtime, PostgreSQL health and Docker HEALTHCHECK.',
  );
} finally {
  for (const resource of resources.reverse()) docker(['rm', '-f', resource], true);
  if (networkCreated) docker(['network', 'rm', prefix], true);
}
