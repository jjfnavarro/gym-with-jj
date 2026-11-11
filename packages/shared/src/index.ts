import { z } from 'zod';
export const id = z.uuid();
// getRandomValues remains available on local-network HTTP previews, where the
// secure-context-only randomUUID method is absent. Both paths use secure entropy.
export function createId(): string {
  const provider = globalThis.crypto;
  if (typeof provider?.randomUUID === 'function') return provider.randomUUID();
  if (!provider?.getRandomValues)
    throw new Error('This browser cannot create secure workout IDs. Use a modern browser.');
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const name = z.string().trim().min(1).max(120);
const notes = z.string().max(4000).default('');
export const equipment = [
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Bodyweight',
  'Smith Machine',
] as const;
export const loadModes = ['external', 'bodyweight', 'weighted-bodyweight', 'assistance'] as const;
export const exerciseSchema = z.object({
  id,
  name,
  primaryMuscle: name,
  secondaryMuscles: z.array(name).max(10).default([]),
  equipment: z.enum(equipment),
  loadMode: z.enum(loadModes).default('external'),
  notes,
  archived: z.boolean().default(false),
});
export const prescriptionSchema = z
  .object({
    id,
    exerciseId: id,
    sets: z.number().int().min(1).max(30),
    repMin: z.number().int().min(1).max(200),
    repMax: z.number().int().min(1).max(200),
    restSeconds: z.number().int().min(0).max(3600),
    warmupSets: z.number().int().min(0).max(10).default(0),
    notes,
    alternative: z.string().max(120).default(''),
    alternativeReps: z.string().max(40).default(''),
  })
  .refine((v) => v.repMax >= v.repMin, {
    message: 'Maximum reps must be at least minimum reps',
    path: ['repMax'],
  });
export const daySchema = z.object({
  id,
  name,
  isRest: z.boolean().default(false),
  cardioMinutes: z.number().int().min(0).max(180).default(0),
  exercises: z.array(prescriptionSchema).max(100),
});
export const splitSchema = z.object({
  id,
  name,
  archived: z.boolean().default(false),
  days: z.array(daySchema).min(1),
});
export const settingsSchema = z.object({
  unit: z.enum(['kg', 'lb']).default('kg'),
  restSeconds: z.number().int().min(0).max(3600).default(90),
  exerciseRestSeconds: z.number().int().min(0).max(3600).default(180),
  restByMuscle: z
    .record(
      z.string().min(1).max(120),
      z.object({
        setSeconds: z.number().int().min(0).max(3600),
        exerciseSeconds: z.number().int().min(0).max(3600),
      }),
    )
    .default({}),
  sound: z.boolean().default(true),
  vibration: z.boolean().default(true),
  notifications: z.boolean().default(false),
  theme: z.enum(['light', 'dark']).default('light'),
  timezone: z
    .string()
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid timezone')
    .default('Asia/Manila'),
  treadmillMinutes: z.number().min(0).max(180).default(15),
  treadmillSpeed: z.number().min(0).max(30).default(5),
  treadmillIncline: z.number().min(0).max(40).default(5),
  activeSplitId: id.nullable().default(null),
});
export const setSchema = z
  .object({
    id,
    weightKg: z
      .number()
      .min(0)
      .max(2000)
      .refine((v) => Number.isFinite(v), 'Invalid weight'),
    reps: z.number().int().min(0).max(500),
    completed: z.boolean(),
    warmup: z.boolean(),
  })
  .refine((v) => !v.completed || v.reps > 0, {
    message: 'Enter at least one rep before completing a set',
    path: ['reps'],
  });
export const sessionExerciseSchema = z.object({
  id,
  exerciseId: id,
  name,
  primaryMuscle: name,
  equipment: z.enum(equipment),
  loadMode: z.enum(loadModes),
  repMin: z.number().int().min(1).max(200),
  repMax: z.number().int().min(1).max(200),
  restSeconds: z.number().int().min(0).max(3600),
  exerciseRestSeconds: z.number().int().min(0).max(3600).default(180),
  notes,
  alternative: z.string().max(120).default(''),
  skipped: z.boolean(),
  sets: z.array(setSchema).max(50),
});
export const cardioSchema = z.object({
  id,
  durationMinutes: z.number().min(0).max(600),
  speedKph: z.number().min(0).max(40),
  incline: z.number().min(0).max(50),
  completed: z.boolean(),
});
export const sessionSchema = z
  .object({
    id,
    splitId: id.nullable(),
    dayId: id.nullable(),
    splitName: name,
    dayName: name,
    unit: z.enum(['kg', 'lb']),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    status: z.enum(['active', 'paused', 'completed', 'abandoned']),
    pausedAt: z.iso.datetime().nullable(),
    pausedMs: z.number().int().nonnegative(),
    notes,
    exercises: z.array(sessionExerciseSchema).max(100),
    cardio: z.array(cardioSchema).max(20),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'completed' && !v.finishedAt)
      ctx.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Completed workouts require a finish time',
      });
    if (v.status !== 'completed' && v.finishedAt)
      ctx.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Only completed workouts have a finish time',
      });
    if (v.finishedAt && Date.parse(v.finishedAt) < Date.parse(v.startedAt))
      ctx.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Finish time must follow start time',
      });
    if ((v.status === 'paused') !== Boolean(v.pausedAt))
      ctx.addIssue({ code: 'custom', path: ['pausedAt'], message: 'Pause state is inconsistent' });
    const ids = [
      ...v.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)]),
      ...v.cardio.map((c) => c.id),
    ];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate workout entry IDs' });
  });
export const syncSchema = z.object({
  mutationId: id,
  baseVersion: z.number().int().nonnegative(),
  session: sessionSchema,
});
export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export const backupSchema = z.object({
  format: z.literal('gym-with-jj'),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  settings: settingsSchema,
  exercises: z.array(exerciseSchema).max(2000),
  splits: z.array(splitSchema).max(200),
  sessions: z.array(sessionSchema).max(20000),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export type Prescription = z.infer<typeof prescriptionSchema>;
export type SplitDay = z.infer<typeof daySchema>;
export type Split = z.infer<typeof splitSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type WorkoutSet = z.infer<typeof setSchema>;
export type SessionExercise = z.infer<typeof sessionExerciseSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ServerSession = Session & { version: number };
export type Bootstrap = {
  owner: { id: string; name: string; email: string };
  settings: Settings;
  exercises: Exercise[];
  splits: Split[];
  sessions: ServerSession[];
};
export const defaults = settingsSchema.parse({});
export function workoutProgress(session: Pick<Session, 'exercises'>) {
  const sets = session.exercises
    .filter((e) => !e.skipped)
    .flatMap((e) => e.sets.filter((s) => !s.warmup));
  const completed = sets.filter((s) => s.completed).length;
  return {
    completed,
    total: sets.length,
    percent: sets.length ? Math.round((completed / sets.length) * 100) : 0,
  };
}
export function volume(session: Pick<Session, 'exercises'>): number {
  return (
    Math.round(
      session.exercises
        .filter((e) => !e.skipped && e.loadMode !== 'assistance' && e.loadMode !== 'bodyweight')
        .flatMap((e) => e.sets.filter((s) => s.completed && !s.warmup))
        .reduce((sum, s) => sum + s.weightKg * s.reps, 0) * 1000,
    ) / 1000
  );
}
export const toDisplayWeight = (kg: number, unit: 'kg' | 'lb') =>
  Math.round(kg * (unit === 'lb' ? 2.2046226218 : 1) * 100) / 100;
export const toKg = (weight: number, unit: 'kg' | 'lb') =>
  Math.round((weight / (unit === 'lb' ? 2.2046226218 : 1)) * 1000) / 1000;
export function personalRecord(exercises: SessionExercise[]) {
  const sets = exercises
    .filter((e) => !e.skipped)
    .flatMap((e) =>
      e.sets.filter((s) => s.completed && !s.warmup).map((s) => ({ ...s, loadMode: e.loadMode })),
    );
  const best = sets.sort((a, b) =>
    a.loadMode === 'bodyweight'
      ? b.reps - a.reps
      : a.loadMode === 'assistance'
        ? a.weightKg - b.weightKg || b.reps - a.reps
        : b.weightKg - a.weightKg || b.reps - a.reps,
  )[0];
  if (!best) return null;
  return {
    ...best,
    estimated1RM:
      best.loadMode === 'external' && best.reps <= 12
        ? Math.round(best.weightKg * (1 + best.reps / 30) * 100) / 100
        : null,
  };
}
export const timerSchema = z.object({
  endAt: z.number().nullable(),
  remainingMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  exerciseName: z.string().max(120),
  done: z.boolean(),
  kind: z.enum(['set', 'exercise']).default('set'),
  nextExerciseId: id.nullable().default(null),
});
export type TimerState = z.infer<typeof timerSchema>;
export const timerRemaining = (timer: TimerState, now = Date.now()) =>
  Math.max(0, timer.endAt === null ? timer.remainingMs : timer.endAt - now);
export const startTimer = (
  seconds: number,
  exerciseName: string,
  now = Date.now(),
  kind: TimerState['kind'] = 'set',
  nextExerciseId: string | null = null,
): TimerState => ({
  endAt: now + seconds * 1000,
  remainingMs: seconds * 1000,
  durationMs: seconds * 1000,
  exerciseName,
  done: false,
  kind,
  nextExerciseId,
});
export const pauseTimer = (timer: TimerState, now = Date.now()): TimerState => ({
  ...timer,
  remainingMs: timerRemaining(timer, now),
  endAt: null,
});
export const resumeTimer = (timer: TimerState, now = Date.now()): TimerState => ({
  ...timer,
  endAt: now + timer.remainingMs,
});
export function elapsedMs(session: Session, now = Date.now()) {
  return Math.max(
    0,
    (session.finishedAt
      ? Date.parse(session.finishedAt)
      : session.pausedAt
        ? Date.parse(session.pausedAt)
        : now) -
      Date.parse(session.startedAt) -
      session.pausedMs,
  );
}
export function newSession(
  split: Split,
  day: SplitDay,
  library: Exercise[],
  history: Session[],
  unit: 'kg' | 'lb',
  settings = defaults,
): Session {
  return {
    id: createId(),
    splitId: split.id,
    dayId: day.id,
    splitName: split.name,
    dayName: day.name,
    unit,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'active',
    pausedAt: null,
    pausedMs: 0,
    notes: '',
    exercises: day.exercises.map((p) => {
      const e = library.find((e) => e.id === p.exerciseId);
      if (!e) throw new Error('Exercise is missing from your library. Refresh before starting.');
      const previous = history
        .filter((s) => s.status === 'completed')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .flatMap((s) => s.exercises)
        .find((x) => x.exerciseId === e.id && x.loadMode === e.loadMode && !x.skipped);
      return {
        id: createId(),
        exerciseId: e.id,
        name: e.name,
        primaryMuscle: e.primaryMuscle,
        equipment: e.equipment,
        loadMode: e.loadMode,
        repMin: p.repMin,
        repMax: p.repMax,
        restSeconds: settings.restByMuscle[e.primaryMuscle]?.setSeconds ?? p.restSeconds,
        exerciseRestSeconds:
          settings.restByMuscle[e.primaryMuscle]?.exerciseSeconds ?? settings.exerciseRestSeconds,
        notes: p.notes,
        alternative: p.alternative,
        skipped: false,
        sets: Array.from({ length: p.sets + p.warmupSets }, (_, i) => {
          const prev = previous?.sets.filter((s) => !s.warmup && s.completed)[
            Math.max(0, i - p.warmupSets)
          ];
          return {
            id: createId(),
            weightKg: prev?.weightKg ?? 0,
            reps: prev?.reps ?? p.repMin,
            completed: false,
            warmup: i < p.warmupSets,
          };
        }),
      };
    }),
    cardio: day.cardioMinutes
      ? [
          {
            id: createId(),
            durationMinutes: day.cardioMinutes,
            speedKph: settings.treadmillSpeed,
            incline: settings.treadmillIncline,
            completed: false,
          },
        ]
      : [],
  };
}
export function restAfterSet(session: Session, exerciseId: string, setId: string) {
  const index = session.exercises.findIndex((e) => e.id === exerciseId);
  const exercise = session.exercises[index];
  const set = exercise?.sets.find((s) => s.id === setId);
  if (!exercise || !set?.completed) return null;
  const working = exercise.sets.filter((s) => !s.warmup);
  if (!set.warmup && working.length > 0 && working.every((s) => s.completed)) {
    const ordered = [...session.exercises.slice(index + 1), ...session.exercises.slice(0, index)];
    const next = ordered.find((e) => !e.skipped && e.sets.some((s) => !s.warmup && !s.completed));
    if (next)
      return {
        kind: 'exercise' as const,
        seconds: exercise.exerciseRestSeconds,
        name: next.name,
        nextExerciseId: next.id,
      };
  }
  return {
    kind: 'set' as const,
    seconds: exercise.restSeconds,
    name: exercise.name,
    nextExerciseId: null,
  };
}
