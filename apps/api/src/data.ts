import { Prisma, type PrismaClient } from '@prisma/client';
import { settingsSchema, type Session, type Split } from '@gym/shared';
export const sessionInclude = {
  exercises: { orderBy: { position: 'asc' }, include: { sets: { orderBy: { position: 'asc' } } } },
  cardio: true,
} satisfies Prisma.WorkoutSessionInclude;
export const splitInclude = {
  days: { orderBy: { position: 'asc' }, include: { exercises: { orderBy: { position: 'asc' } } } },
} satisfies Prisma.WorkoutSplitInclude;
export function serializeSession(
  s: Prisma.WorkoutSessionGetPayload<{ include: typeof sessionInclude }>,
) {
  return {
    ...s,
    startedAt: s.startedAt.toISOString(),
    finishedAt: s.finishedAt?.toISOString() ?? null,
    pausedAt: s.pausedAt?.toISOString() ?? null,
    exercises: s.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s, weightKg: Number(s.weightKg) })),
    })),
    cardio: s.cardio.map((c) => ({
      ...c,
      durationMinutes: Number(c.durationMinutes),
      speedKph: Number(c.speedKph),
      incline: Number(c.incline),
    })),
  };
}
export function sessionData(s: Session) {
  const { exercises, cardio, ...rest } = s;
  return {
    ...rest,
    exercises: {
      create: exercises.map((e, position) => ({
        ...e,
        position,
        sets: { create: e.sets.map((s, position) => ({ ...s, position })) },
      })),
    },
    cardio: { create: cardio },
  };
}
export async function saveSplit(tx: Prisma.TransactionClient, userId: string, split: Split) {
  const existing = await tx.workoutSplit.findUnique({ where: { id: split.id } });
  if (existing && existing.userId !== userId) throw new Error('FORBIDDEN');
  const exerciseIds = split.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
  if (
    (await tx.exercise.count({ where: { userId, id: { in: [...new Set(exerciseIds)] } } })) !==
    new Set(exerciseIds).size
  )
    throw new Error('UNKNOWN_EXERCISE');
  await tx.workoutSplit.upsert({
    where: { id: split.id },
    create: { id: split.id, userId, name: split.name, archived: split.archived },
    update: { name: split.name, archived: split.archived },
  });
  await tx.splitDay.deleteMany({ where: { splitId: split.id } });
  for (const [position, d] of split.days.entries())
    await tx.splitDay.create({
      data: {
        ...d,
        splitId: split.id,
        position,
        exercises: { create: d.exercises.map((e, position) => ({ ...e, position })) },
      },
    });
}
export async function bootstrap(db: PrismaClient, userId: string) {
  const [owner, settings, exercises, splits, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    db.userSettings.findUniqueOrThrow({ where: { userId } }),
    db.exercise.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    db.workoutSplit.findMany({
      where: { userId },
      include: splitInclude,
      orderBy: { createdAt: 'asc' },
    }),
    db.workoutSession.findMany({
      where: { userId, deletedAt: null },
      include: sessionInclude,
      orderBy: { startedAt: 'desc' },
    }),
  ]);
  return {
    owner,
    settings: settingsSchema.parse(settings.preferences),
    exercises,
    splits,
    sessions: sessions.map(serializeSession),
  };
}
