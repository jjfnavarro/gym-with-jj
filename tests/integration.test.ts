import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes, randomUUID, createECDH } from 'node:crypto';
import { generateRequestDetails } from 'web-push';
import { createDatabase } from '../apps/api/src/db';
import { createApp } from '../apps/api/src/app';
import { seedOwner, seedData } from '../apps/api/src/seed';
import { newSession, type Session, type Split } from '@gym/shared';
import { createPushService, type PushSender } from '../apps/api/src/push';
import { logger } from '../apps/api/src/app';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable database ending in _test. Integration tests reset its owner data.',
  );
const db = createDatabase(url);
const app = createApp(db, { origin: 'http://localhost:5173' });
const agent = request.agent(app);
const password = randomBytes(32).toString('hex');
let csrf = '';
let split: Split;
let session: Session;
let version = 0;
const put = (path: string, body: unknown) =>
  agent
    .put(`/api${path}`)
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf)
    .send(body);
const post = (path: string, body: unknown) =>
  agent
    .post(`/api${path}`)
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf)
    .send(body);
const remove = (path: string, body = {}) =>
  agent
    .delete(`/api${path}`)
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf)
    .send(body);
beforeAll(async () => {
  await db.workoutSplit.deleteMany();
  await db.user.deleteMany();
  const owner = await db.user.create({
    data: {
      email: 'integration@example.test',
      name: 'JJ',
      passwordHash: await argon2.hash(password),
    },
  });
  await db.$transaction((tx) => seedOwner(tx, owner.id), { timeout: 30000 });
});

describe('durable background rest alerts', () => {
  const delivered: Array<{
    payload: {
      notification: { title: string; body: string; silent: boolean; navigate: string };
      web_push: number;
    };
    options: unknown;
  }> = [];
  const sender: PushSender = async (subscription, payload, options) => {
    const request = generateRequestDetails(subscription, payload, options);
    expect(request.headers?.Authorization).toBeTruthy();
    expect(request.body).toBeInstanceOf(Buffer);
    delivered.push({ payload: JSON.parse(String(payload)), options });
    return { statusCode: 201, body: '', headers: {} };
  };
  let subscriptionId: string;
  beforeAll(async () => {
    csrf = (await post('/auth/login', { email: 'integration@example.test', password })).body
      .csrfToken;
  });
  const subscribe = async () => {
    const receiver = createECDH('prime256v1');
    receiver.generateKeys();
    const result = await post('/push/subscriptions', {
      endpoint: `https://web.push.apple.com/${randomUUID()}`,
      keys: {
        p256dh: receiver.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    });
    expect(result.status).toBe(200);
    subscriptionId = result.body.id;
    delivered.length = 0;
  };
  const schedule = (revision: number, delayMs: number | null = 60000, extra = {}) =>
    put(`/push/subscriptions/${subscriptionId}/timer`, {
      revision,
      delayMs,
      exerciseName: 'Chest press',
      ...extra,
    });
  const makeDue = () =>
    db.restPushJob.update({
      where: { subscriptionId },
      data: { dueAt: new Date(Date.now() - 100), nextAttemptAt: new Date(Date.now() - 100) },
    });
  it('keeps private signing keys server-side and stable across service restarts', async () => {
    expect((await request(app).get('/api/push/config')).status).toBe(401);
    const first = await agent.get('/api/push/config');
    expect(first.status).toBe(200);
    expect(Object.keys(first.body)).toEqual(['publicKey']);
    const restarted = createPushService(db, 'https://gym.example', logger, sender);
    expect((await restarted.config()).publicKey).toBe(first.body.publicKey);
    expect(
      (
        await post('/push/subscriptions', {
          endpoint: 'https://127.0.0.1/private',
          keys: { p256dh: '', auth: '' },
        })
      ).status,
    ).toBe(400);
  });
  it('delivers a persisted due timer once, without an open browser page', async () => {
    await subscribe();
    expect((await schedule(1)).body.scheduled).toBe(true);
    await makeDue();
    const restarted = createPushService(db, 'https://gym.example', logger, sender);
    await Promise.all([
      restarted.tick(),
      createPushService(db, 'https://gym.example', logger, sender).tick(),
    ]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.payload).toMatchObject({
      web_push: 8030,
      notification: {
        title: 'Rest complete',
        body: 'Next set: Chest press',
        silent: false,
        navigate: 'https://gym.example/',
      },
    });
    expect(delivered[0]!.options).toMatchObject({
      urgency: 'high',
      topic: 'jj-rest-complete',
      timeout: 5000,
    });
    await restarted.tick();
    expect(delivered).toHaveLength(1);
  });
  it('cancels paused/skipped rest and rejects older requests arriving after cancellation', async () => {
    await subscribe();
    await schedule(1);
    expect((await schedule(3, null)).body.scheduled).toBe(false);
    expect((await schedule(2)).body.superseded).toBe(true);
    await createPushService(db, 'https://gym.example', logger, sender).tick();
    expect(delivered).toHaveLength(0);
    expect(
      (await db.restPushJob.findUniqueOrThrow({ where: { subscriptionId } })).dueAt,
    ).toBeNull();
  });
  it('replaces rest, supports exercise breaks, and honors the sound setting', async () => {
    await subscribe();
    await schedule(1);
    await schedule(2, 90000, { exerciseName: 'Next movement', kind: 'exercise', sound: false });
    await makeDue();
    await createPushService(db, 'https://gym.example', logger, sender).tick();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.payload.notification).toMatchObject({
      body: 'Next exercise: Next movement',
      silent: true,
    });
  });
  it('expires stale jobs and retries temporary failures without retrying invalid subscriptions', async () => {
    await subscribe();
    await schedule(1);
    await db.restPushJob.update({
      where: { subscriptionId },
      data: { dueAt: new Date(Date.now() - 61000), nextAttemptAt: new Date(Date.now() - 61000) },
    });
    await createPushService(db, 'https://gym.example', logger, sender).tick();
    expect(delivered).toHaveLength(0);
    await schedule(2);
    await makeDue();
    const temporary: PushSender = async () => {
      throw { statusCode: 503 };
    };
    await createPushService(db, 'https://gym.example', logger, temporary).tick();
    expect((await db.restPushJob.findUniqueOrThrow({ where: { subscriptionId } })).attempts).toBe(
      1,
    );
    await db.restPushJob.update({
      where: { subscriptionId },
      data: { nextAttemptAt: new Date(Date.now() - 100) },
    });
    await createPushService(db, 'https://gym.example', logger, sender).tick();
    expect(delivered).toHaveLength(1);
    await schedule(3);
    await makeDue();
    const gone: PushSender = async () => {
      throw { statusCode: 410 };
    };
    await createPushService(db, 'https://gym.example', logger, gone).tick();
    expect(
      (await db.pushSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })).enabled,
    ).toBe(false);
    expect((await schedule(4)).status).toBe(404);
  });
  it('requires owner authentication/CSRF and removes scheduled alerts when disabled', async () => {
    await subscribe();
    expect(
      (
        await request(app)
          .put(`/api/push/subscriptions/${subscriptionId}/timer`)
          .set('Origin', 'http://localhost:5173')
          .send({ revision: 1, delayMs: 10000 })
      ).status,
    ).toBe(401);
    expect(
      (
        await agent
          .put(`/api/push/subscriptions/${subscriptionId}/timer`)
          .set('Origin', 'http://localhost:5173')
          .send({ revision: 1, delayMs: 10000 })
      ).status,
    ).toBe(403);
    expect((await schedule(1, 20000000)).status).toBe(400);
    expect((await schedule(1, 10000, { path: '//evil.example' })).status).toBe(400);
    expect(
      (await put(`/push/subscriptions/${randomUUID()}/timer`, { revision: 1, delayMs: 10000 }))
        .status,
    ).toBe(404);
    await schedule(1);
    expect((await remove(`/push/subscriptions/${subscriptionId}`)).status).toBe(204);
    await createPushService(db, 'https://gym.example', logger, sender).tick();
    expect(delivered).toHaveLength(0);
    expect(
      (await db.restPushJob.findUniqueOrThrow({ where: { subscriptionId } })).dueAt,
    ).toBeNull();
  });
});
afterAll(async () => {
  await db.workoutSplit.deleteMany();
  await db.user.deleteMany();
  await db.$disconnect();
});
describe('PostgreSQL API lifecycle and security', () => {
  it('uses a secure host-scoped production cookie', async () => {
    const productionApp = createApp(db, { production: true, origin: 'https://gym.example' });
    const result = await request(productionApp)
      .post('/api/auth/login')
      .set('Origin', 'https://gym.example')
      .send({ email: 'integration@example.test', password });
    expect(result.status).toBe(200);
    expect(result.headers['set-cookie']?.[0]).toMatch(/^__Host-gym_session=/);
    expect(result.headers['set-cookie']?.[0]).toContain('Secure');
    expect(result.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });
  it('protects owner data, rejects bad origins and bad credentials', async () => {
    expect((await request(app).get('/api/bootstrap')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', 'https://evil.example')
          .send({ email: 'integration@example.test', password })
      ).status,
    ).toBe(403);
    expect(
      (await post('/auth/login', { email: 'integration@example.test', password: 'incorrect' }))
        .status,
    ).toBe(401);
  });
  it('logs in with an HttpOnly SameSite cookie and a CSRF token', async () => {
    const result = await post('/auth/login', { email: 'integration@example.test', password });
    expect(result.status).toBe(200);
    expect(result.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(result.headers['set-cookie']?.[0]).toContain('SameSite=Strict');
    csrf = result.body.csrfToken;
    expect(csrf).toHaveLength(64);
  });
  it('rejects missing CSRF tokens and does not cache API responses', async () => {
    expect(
      (await agent.put('/api/settings').set('Origin', 'http://localhost:5173').send({})).status,
    ).toBe(403);
    const result = await agent.get('/api/bootstrap');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.splits).toHaveLength(1);
  });
  it('seeds idempotently', async () => {
    const owner = await db.user.findFirstOrThrow();
    await db.$transaction((tx) => seedOwner(tx, owner.id));
    expect(await db.workoutSplit.count()).toBe(1);
  });
  it('creates and edits an exercise and a split with arbitrary days', async () => {
    const exercise = {
      id: randomUUID(),
      name: 'Test press',
      primaryMuscle: 'Chest',
      secondaryMuscles: [],
      equipment: 'Dumbbell',
      loadMode: 'external',
      notes: 'Custom',
      archived: false,
    };
    expect((await put(`/exercises/${exercise.id}`, exercise)).status).toBe(200);
    expect(
      (await put(`/exercises/${exercise.id}`, { ...exercise, name: 'Custom press' })).body.name,
    ).toBe('Custom press');
    split = {
      id: randomUUID(),
      name: 'Integration split',
      archived: false,
      days: [
        {
          id: randomUUID(),
          name: 'Custom day',
          isRest: false,
          cardioMinutes: 0,
          exercises: [
            {
              id: randomUUID(),
              exerciseId: exercise.id,
              sets: 2,
              repMin: 8,
              repMax: 12,
              restSeconds: 30,
              warmupSets: 0,
              notes: '',
              alternative: '',
              alternativeReps: '',
            },
          ],
        },
        { id: randomUUID(), name: 'Recover', isRest: true, cardioMinutes: 0, exercises: [] },
      ],
    };
    expect((await put(`/splits/${split.id}`, split)).status).toBe(200);
    const boot = await agent.get('/api/bootstrap');
    session = newSession(split, split.days[0]!, boot.body.exercises, [], 'kg');
  });
  it('rejects invalid schema inputs', async () => {
    expect((await put(`/splits/${split.id}`, { ...split, days: [] })).status).toBe(400);
  });
  it('starts a workout with a stable ID and deduplicates a retry', async () => {
    const payload = { session, baseVersion: 0, mutationId: randomUUID() };
    const result = await post('/sessions/sync', payload);
    expect(result.status).toBe(200);
    version = result.body.version;
    expect(version).toBe(1);
    const retry = await post('/sessions/sync', payload);
    expect(retry.body.version).toBe(1);
    expect(await db.workoutSession.count()).toBe(1);
    expect(await db.workoutSet.count()).toBe(2);
  });
  it('logs and undoes a set using actual Decimal weight', async () => {
    session.exercises[0]!.sets[0] = {
      ...session.exercises[0]!.sets[0]!,
      weightKg: 22.125,
      reps: 11,
      completed: true,
    };
    let result = await post('/sessions/sync', {
      session,
      baseVersion: version,
      mutationId: randomUUID(),
    });
    expect(result.status).toBe(200);
    version = result.body.version;
    expect(result.body.exercises[0].sets[0].weightKg).toBe(22.125);
    session.exercises[0]!.sets[0]!.completed = false;
    result = await post('/sessions/sync', {
      session,
      baseVersion: version,
      mutationId: randomUUID(),
    });
    expect(result.body.exercises[0].sets[0].completed).toBe(false);
    version = result.body.version;
  });
  it('rejects stale changes and a second active session', async () => {
    expect(
      (await post('/sessions/sync', { session, baseVersion: 0, mutationId: randomUUID() })).status,
    ).toBe(409);
    expect(
      (
        await post('/sessions/sync', {
          session: { ...session, id: randomUUID(), exercises: [] },
          baseVersion: 0,
          mutationId: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });
  it('completes and preserves history after editing and deleting templates', async () => {
    session.exercises[0]!.sets[0]!.completed = true;
    session.status = 'completed';
    session.finishedAt = new Date().toISOString();
    const done = await post('/sessions/sync', {
      session,
      baseVersion: version,
      mutationId: randomUUID(),
    });
    expect(done.status).toBe(200);
    version = done.body.version;
    split.name = 'Changed template';
    split.days[0]!.name = 'Renamed day';
    expect((await put(`/splits/${split.id}`, split)).status).toBe(200);
    expect((await remove(`/splits/${split.id}`)).status).toBe(204);
    const boot = await agent.get('/api/bootstrap');
    expect(boot.body.sessions[0].splitName).toBe('Integration split');
    expect(boot.body.sessions[0].dayName).toBe('Custom day');
    expect(boot.body.sessions[0].exercises[0].sets[0].weightKg).toBe(22.125);
  });
  it('protects completed results but allows version-checked notes', async () => {
    expect(
      (await post('/sessions/sync', { session, baseVersion: version, mutationId: randomUUID() }))
        .status,
    ).toBe(409);
    const result = await agent
      .patch(`/api/sessions/${session.id}/notes`)
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', csrf)
      .send({ version, notes: 'Feeling strong' });
    expect(result.status).toBe(204);
    version++;
    expect((await agent.get('/api/bootstrap')).body.sessions[0].notes).toBe('Feeling strong');
  });
  it('merges backup retries without duplicating sessions', async () => {
    const boot = (await agent.get('/api/bootstrap')).body;
    const body = {
      format: 'gym-with-jj',
      version: 1,
      exportedAt: new Date().toISOString(),
      ...boot,
    };
    expect((await post('/backups/import', body)).body.imported).toBe(0);
    expect(await db.workoutSession.count()).toBe(1);
  });
  it('uses tombstones so stale devices cannot resurrect deleted records', async () => {
    expect((await remove(`/sessions/${session.id}`, { version })).status).toBe(204);
    expect(
      (
        await post('/sessions/sync', {
          session,
          baseVersion: version + 1,
          mutationId: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect((await agent.get('/api/bootstrap')).body.sessions).toHaveLength(0);
    expect(await db.workoutSession.count()).toBe(1);
  });
  it('archives a global exercise and logs out', async () => {
    const exerciseId = session.exercises[0]!.exerciseId;
    expect((await remove(`/exercises/${exerciseId}`)).status).toBe(204);
    expect((await db.exercise.findUniqueOrThrow({ where: { id: exerciseId } })).archived).toBe(
      true,
    );
    expect((await post('/auth/logout', {})).status).toBe(204);
    expect((await agent.get('/api/bootstrap')).status).toBe(401);
  });
});
