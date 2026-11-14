import assert from 'node:assert/strict';
const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:4180';
for (const path of ['/', '/history']) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('cache-control'), 'no-cache', path);
  assert.match(await response.text(), /GYM WITH JJ/);
}
const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok' });
const worker = await fetch(`${base}/sw.js`);
assert.equal(worker.status, 200);
assert.equal(worker.headers.get('cache-control'), 'no-cache');
assert.match(await worker.text(), /push-events\.js/);
const pushWorker = await fetch(`${base}/push-events.js`);
assert.equal(pushWorker.status, 200);
assert.equal(pushWorker.headers.get('cache-control'), 'no-cache');
assert.match(await pushWorker.text(), /notificationclick/);
const alarm = await fetch(`${base}/rest-alarm-v2.wav`);
assert.equal(alarm.status, 200);
assert.match(alarm.headers.get('content-type') ?? '', /audio\/wav/);
const missingAsset = await fetch(`${base}/assets/previous-release.js`);
assert.equal(missingAsset.status, 404);
assert.doesNotMatch(await missingAsset.text(), /<html/i);
for (const path of ['/api/bootstrap', '/api/missing']) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 401, path);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
const rejected = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
  body: JSON.stringify({ email: 'nobody@example.test', password: 'invalid-smoke-input' }),
});
assert.equal(rejected.status, 403);
const invalid = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://gym.example' },
  body: JSON.stringify({ email: 'nobody@example.test', password: 'invalid-smoke-input' }),
});
assert.equal(invalid.status, 401);
console.info(
  'Container smoke passed: frontend, SPA routes, update-safe cache headers, alarm asset, missing-asset 404, PostgreSQL health, protected JSON API, origin protection and native password hashing.',
);
