import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '../apps/api/src/db';
import { createApp } from '../apps/api/src/app';
import { seedOwner, seedData } from '../apps/api/src/seed';
import { newSession, type Session, type Split } from '@gym/shared';
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
