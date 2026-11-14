import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { createDatabase } from '../../apps/api/src/db';
import { seedOwner } from '../../apps/api/src/seed';
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL!;
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('Refusing to reset a non-test database');
  const db = createDatabase(url);
  process.env.E2E_PASSWORD = randomBytes(32).toString('hex');
  try {
    await db.workoutSplit.deleteMany();
    await db.user.deleteMany();
    const owner = await db.user.create({
      data: {
        email: 'e2e@example.test',
        name: 'JJ',
        passwordHash: await argon2.hash(process.env.E2E_PASSWORD),
      },
    });
    await db.$transaction((tx) => seedOwner(tx, owner.id), { timeout: 30000 });
    // Push-flow tests use a disposable session so unrelated browser projects
    // do not exhaust the production-strength login attempt limit.
    const token = randomBytes(32).toString('hex');
    await db.authSession.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: owner.id,
        csrfToken: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    process.env.E2E_SESSION_TOKEN = token;
  } finally {
    await db.$disconnect();
  }
}
