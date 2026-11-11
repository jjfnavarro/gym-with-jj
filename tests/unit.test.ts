import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  workoutProgress,
  createId,
  restAfterSet,
  settingsSchema,
  id,
  volume,
  toKg,
  toDisplayWeight,
  startTimer,
  timerRemaining,
  pauseTimer,
  resumeTimer,
  personalRecord,
  sessionSchema,
  splitSchema,
  prescriptionSchema,
  backupSchema,
  newSession,
  elapsedMs,
} from '@gym/shared';
import { seedData } from '../apps/api/src/seed';
const fixture = () => {
  const { split, exercises } = seedData();
  return newSession(split, split.days[0]!, exercises, [], 'kg');
};
afterEach(() => vi.useRealTimers());
describe('mobile LAN preview IDs', () => {
  it('creates unique valid UUIDs without the secure-context randomUUID method', () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    try {
      const values = Array.from({ length: 100 }, () => createId());
      expect(values.every((value) => id.safeParse(value).success)).toBe(true);
      expect(new Set(values).size).toBe(100);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
describe('working-set progress', () => {
  it('keeps set and next-exercise rest separate and applies muscle overrides', () => {
    const { split, exercises } = seedData();
    const settings = settingsSchema.parse({
      restByMuscle: { Chest: { setSeconds: 45, exerciseSeconds: 150 } },
    });
    const session = newSession(split, split.days[0]!, exercises, [], 'kg', settings);
    const first = session.exercises[0]!;
    first.sets[0]!.completed = true;
    expect(first.restSeconds).toBe(45);
    expect(first.exerciseRestSeconds).toBe(150);
    expect(restAfterSet(session, first.id, first.sets[0]!.id)).toMatchObject({
      kind: 'set',
      seconds: 45,
    });
    first.sets.forEach((s) => (s.completed = true));
    expect(restAfterSet(session, first.id, first.sets.at(-1)!.id)).toMatchObject({
      kind: 'exercise',
      seconds: 150,
      name: 'Pull-ups',
      nextExerciseId: session.exercises[1]!.id,
    });
    expect(session.exercises[1]!.restSeconds).toBe(150);
  });
  it('skips completed or skipped exercises when choosing the next rest target', () => {
    const session = fixture();
    const first = session.exercises[0]!;
    first.sets.forEach((s) => (s.completed = true));
    session.exercises[1]!.skipped = true;
    expect(restAfterSet(session, first.id, first.sets[0]!.id)?.nextExerciseId).toBe(
      session.exercises[2]!.id,
    );
    first.sets[0]!.completed = false;
    expect(restAfterSet(session, first.id, first.sets[0]!.id)).toBeNull();
  });
  it('uses completed sets / planned sets, excluding warmups', () => {
    const s = fixture();
    s.exercises = s.exercises.slice(0, 1);
    s.exercises[0]!.sets[0]!.completed = true;
    s.exercises[0]!.sets.push({
      id: crypto.randomUUID(),
      weightKg: 5,
      reps: 10,
      completed: true,
      warmup: true,
    });
    expect(workoutProgress(s)).toEqual({ completed: 1, total: 3, percent: 33 });
  });
  it('recalculates when adding and removing sets', () => {
    const s = fixture();
    s.exercises = s.exercises.slice(0, 1);
    s.exercises[0]!.sets[0]!.completed = true;
    s.exercises[0]!.sets.pop();
    expect(workoutProgress(s).percent).toBe(50);
    s.exercises[0]!.sets.push({
      ...s.exercises[0]!.sets[0]!,
      id: crypto.randomUUID(),
      completed: false,
    });
    expect(workoutProgress(s).percent).toBe(33);
  });
  it('excludes skipped exercises and handles zero denominator', () => {
    const s = fixture();
    s.exercises.forEach((e) => (e.skipped = true));
    expect(workoutProgress(s)).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(workoutProgress({ exercises: [] }).percent).toBe(0);
  });
  it('undoing completion reduces progress', () => {
    const s = fixture();
    s.exercises.forEach((e) => e.sets.forEach((s) => (s.completed = true)));
    expect(workoutProgress(s).percent).toBe(100);
    s.exercises[0]!.sets[0]!.completed = false;
    expect(workoutProgress(s).percent).toBeLessThan(100);
  });
});
describe('wall-clock rest timer', () => {
  it('recovers after tab suspension rather than counting ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const timer = startTimer(120, 'Press');
    vi.setSystemTime(91000);
    expect(timerRemaining(timer)).toBe(30000);
    vi.setSystemTime(200000);
    expect(timerRemaining(timer)).toBe(0);
  });
  it('pauses and resumes without drift', () => {
    const timer = startTimer(90, 'Row', 1000);
    const paused = pauseTimer(timer, 31000);
    expect(timerRemaining(paused, 100000)).toBe(60000);
    const resumed = resumeTimer(paused, 200000);
    expect(timerRemaining(resumed, 215000)).toBe(45000);
  });
  it('clamps expired and zero-duration timers', () => {
    expect(timerRemaining(startTimer(0, 'Empty', 100), 100)).toBe(0);
    expect(timerRemaining(startTimer(30, 'Curl', 100), 999999)).toBe(0);
  });
});
describe('volume, units and PR rules', () => {
  it('uses only completed working sets with external load', () => {
    const s = fixture();
    s.exercises = s.exercises.slice(0, 1);
    s.exercises[0]!.sets.forEach((x) => {
      x.weightKg = 20;
      x.reps = 10;
    });
    s.exercises[0]!.sets[0]!.completed = true;
    s.exercises[0]!.sets[1]!.completed = true;
    s.exercises[0]!.sets[1]!.warmup = true;
    expect(volume(s)).toBe(200);
    s.exercises[0]!.loadMode = 'assistance';
    expect(volume(s)).toBe(0);
    s.exercises[0]!.loadMode = 'bodyweight';
    expect(volume(s)).toBe(0);
  });
  it('converts kilograms/pounds consistently', () => {
    expect(toDisplayWeight(100, 'lb')).toBeCloseTo(220.46, 2);
    expect(toKg(220.46226218, 'lb')).toBe(100);
    expect(toKg(12.5, 'kg')).toBe(12.5);
  });
  it('breaks load ties by reps and estimates only eligible external sets', () => {
    const e = fixture().exercises[0]!;
    e.sets.forEach((s, i) => {
      s.completed = true;
      s.weightKg = 20;
      s.reps = 8 + i;
    });
    const pr = personalRecord([e]);
    expect(pr?.reps).toBe(10);
    expect(pr?.estimated1RM).toBe(26.67);
    e.sets.forEach((s) => (s.reps = 15));
    expect(personalRecord([e])?.estimated1RM).toBeNull();
  });
  it('prefers less assistance and never estimates bodyweight 1RM', () => {
    const e = fixture().exercises[0]!;
    e.loadMode = 'assistance';
    e.sets.forEach((s, i) => {
      s.completed = true;
      s.weightKg = 30 - i * 5;
    });
    expect(personalRecord([e])?.weightKg).toBe(20);
    expect(personalRecord([e])?.estimated1RM).toBeNull();
    e.loadMode = 'weighted-bodyweight';
    expect(personalRecord([e])?.estimated1RM).toBeNull();
  });
  it('returns null when there are no completed working sets', () =>
    expect(personalRecord(fixture().exercises)).toBeNull());
});
describe('validation and snapshots', () => {
  it('supports arbitrary cycle lengths without a fixed day cap', () => {
    const { split } = seedData();
    const days = Array.from({ length: 101 }, (_, i) => ({
      id: crypto.randomUUID(),
      name: `Day ${i + 1}`,
      isRest: true,
      cardioMinutes: 0,
      exercises: [],
    }));
    expect(splitSchema.parse({ ...split, days }).days).toHaveLength(101);
  });
  it('rejects completed sets with zero reps', () => {
    const s = fixture();
    s.exercises[0]!.sets[0]!.completed = true;
    s.exercises[0]!.sets[0]!.reps = 0;
    expect(sessionSchema.safeParse(s).success).toBe(false);
  });
  it('rejects reversed rep ranges', () => {
    const { split } = seedData();
    expect(
      prescriptionSchema.safeParse({ ...split.days[0]!.exercises[0], repMin: 20, repMax: 8 })
        .success,
    ).toBe(false);
  });
  it('rejects missing finish time, duplicate set IDs and invalid backups', () => {
    const s = fixture();
    s.status = 'completed';
    expect(sessionSchema.safeParse(s).success).toBe(false);
    s.status = 'active';
    s.exercises[0]!.sets[1]!.id = s.exercises[0]!.sets[0]!.id;
    expect(sessionSchema.safeParse(s).success).toBe(false);
    expect(backupSchema.safeParse({ version: 2 }).success).toBe(false);
  });
  it('copies rather than references template values', () => {
    const { split, exercises } = seedData();
    const s = newSession(split, split.days[0]!, exercises, [], 'kg');
    split.days[0]!.name = 'Changed';
    exercises.find((e) => e.id === s.exercises[0]!.exerciseId)!.name = 'Renamed';
    expect(s.dayName).toBe('Upper A');
    expect(s.exercises[0]!.name).toBe('Incline Dumbbell Press');
  });
  it('prefills previous actual performance', () => {
    const { split, exercises } = seedData();
    const first = fixture();
    first.status = 'completed';
    first.finishedAt = new Date().toISOString();
    first.exercises[0]!.sets[0] = {
      ...first.exercises[0]!.sets[0]!,
      weightKg: 22,
      reps: 11,
      completed: true,
    };
    const next = newSession(split, split.days[0]!, exercises, [first], 'lb');
    expect(next.exercises[0]!.sets[0]!.weightKg).toBe(22);
    expect(next.exercises[0]!.sets[0]!.reps).toBe(11);
  });
  it('subtracts paused duration from completed elapsed time', () => {
    const s = fixture();
    s.startedAt = '2026-11-10T00:00:00.000Z';
    s.finishedAt = '2026-11-10T00:10:00.000Z';
    s.pausedMs = 60000;
    expect(elapsedMs(s)).toBe(540000);
  });
  it('seeds exactly the requested independent prescriptions', () => {
    const { split } = seedData();
    expect(split.days).toHaveLength(7);
    expect(split.days.filter((d) => !d.isRest).map((d) => d.exercises.length)).toEqual([
      8, 7, 8, 8,
    ]);
    expect(split.days.filter((d) => !d.isRest).map((d) => d.cardioMinutes)).toEqual([
      15, 10, 15, 10,
    ]);
    expect(new Set(split.days.flatMap((d) => d.exercises.map((e) => e.id))).size).toBe(31);
  });
});
