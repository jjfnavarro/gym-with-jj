import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../apps/api/src/app';

const db = {} as PrismaClient;
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gym-static-test-'));
  await mkdir(join(directory, 'assets'));
  await Promise.all([
    writeFile(join(directory, 'index.html'), '<html>GYM WITH JJ</html>'),
    writeFile(join(directory, 'sw.js'), '// worker'),
    writeFile(join(directory, 'assets', 'app-a1b2c3d4.js'), '// app'),
  ]);
});
afterAll(async () => {
  // Delete only the exact temporary fixture created by this test.
  if (
    directory &&
    dirname(resolve(directory)) === resolve(tmpdir()) &&
    basename(directory).startsWith('gym-static-test-')
  )
    await rm(directory, { recursive: true, force: true });
});
describe('production HTTP deployment boundaries', () => {
  it('rejects origins that would prevent every production login', () => {
    expect(() => createApp(db, { origin: 'https://gym.example/' })).toThrow('exact origin');
    expect(() => createApp(db, { origin: 'https://gym.example/path' })).toThrow('exact origin');
    expect(() => createApp(db, { origin: 'http://gym.example', production: true })).toThrow(
      'HTTPS',
    );
  });
  it('revalidates the service worker and HTML while caching fingerprinted assets', async () => {
    const app = createApp(db, {
      origin: 'https://gym.example',
      production: true,
      staticDir: directory,
    });
    for (const path of ['/', '/history', '/index.html', '/sw.js']) {
      const result = await request(app).get(path);
      expect(result.status, path).toBe(200);
      expect(result.headers['cache-control'], path).toBe('no-cache');
    }
    const asset = await request(app).get('/assets/app-a1b2c3d4.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const missing = await request(app).get('/assets/previous-release.js');
    expect(missing.status).toBe(404);
    expect(missing.text).not.toContain('<html>');
  });
  it('returns an actionable 413 for oversized requests instead of a server failure', async () => {
    const app = createApp(db, { origin: 'http://localhost:5173' });
    const result = await request(app)
      .post('/api/backups/import')
      .set('Origin', 'http://localhost:5173')
      .send({ padding: 'x'.repeat(15 * 1024 * 1024) });
    expect(result.status).toBe(413);
    expect(result.body.error).toContain('15 MB');
  });
});
