import 'dotenv/config';
import argon2 from 'argon2';
import { z } from 'zod';
import { createDatabase } from './db.js';
import { seedOwner } from './seed.js';
const input = z
  .object({
    OWNER_EMAIL: z.email(),
    OWNER_NAME: z.string().min(1).max(100).default('JJ'),
    OWNER_PASSWORD: z.string().min(12).max(200),
  })
  .parse(process.env);
const db = createDatabase();
try {
  if (await db.user.count())
    throw new Error(
      'An owner already exists. Public registration and owner replacement are disabled.',
    );
  const passwordHash = await argon2.hash(input.OWNER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.$transaction(
    async (tx) => {
      const owner = await tx.user.create({
        data: { email: input.OWNER_EMAIL.toLowerCase(), name: input.OWNER_NAME, passwordHash },
      });
      await seedOwner(tx, owner.id);
    },
    { timeout: 30000 },
  );
  console.info(
    'Owner created and editable starter split seeded. Remove OWNER_PASSWORD from your environment now.',
  );
} finally {
  await db.$disconnect();
}
