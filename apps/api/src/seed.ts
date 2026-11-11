import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { defaults, type Exercise, type Split } from '@gym/shared';
export function seedId(key: string) {
  const h = createHash('sha256').update(`gym-with-jj-v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
type Row = [
  string,
  string,
  Exercise['equipment'],
  number,
  number,
  number,
  number,
  string?,
  string?,
];
const upperA: Row[] = [
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell', 3, 8, 12, 120, 'Incline Smith Press'],
  ['Pull-ups', 'Back', 'Bodyweight', 3, 6, 10, 150, 'Assisted Pull-ups'],
  ['Machine Chest Press', 'Chest', 'Machine', 2, 8, 12, 120, 'Flat Dumbbell Press'],
  ['Seated Cable Row', 'Back', 'Cable', 3, 8, 12, 120, 'Machine Row'],
  ['Rope Triceps Pushdown', 'Triceps', 'Cable', 2, 10, 15, 75],
  ['Overhead Cable Triceps Extension', 'Triceps', 'Cable', 2, 10, 15, 75],
  ['Incline Dumbbell Curl', 'Biceps', 'Dumbbell', 2, 10, 15, 75],
  ['Hammer Curl', 'Biceps', 'Dumbbell', 2, 10, 15, 75],
];
const lowerA: Row[] = [
  ['Hack Squat', 'Quads', 'Machine', 3, 8, 10, 150],
  ['Romanian Deadlift', 'Hamstrings', 'Barbell', 2, 8, 12, 150],
  ['Leg Press', 'Quads', 'Machine', 2, 10, 12, 120],
  ['Seated Leg Curl', 'Hamstrings', 'Machine', 3, 10, 15, 90],
  ['Cable Lateral Raise', 'Shoulders', 'Cable', 3, 12, 20, 60],
  ['Standing Calf Raise', 'Calves', 'Machine', 3, 10, 15, 75],
  ['Cable Crunch', 'Core', 'Cable', 2, 10, 15, 60],
];
const upperB: Row[] = [
  ['Barbell Bent-Over Row', 'Back', 'Barbell', 3, 6, 10, 150, 'Chest-Supported Row'],
  ['Incline Machine Chest Press', 'Chest', 'Machine', 3, 8, 12, 120],
  ['Lat Pulldown', 'Back', 'Cable', 3, 10, 12, 120, 'Pull-ups'],
  ['Chest Dips', 'Chest', 'Bodyweight', 2, 8, 12, 120, 'High-to-Low Cable Fly', '10–15'],
  ['Preacher Curl', 'Biceps', 'Machine', 2, 10, 15, 75],
  ['Cable Bicep Curl', 'Biceps', 'Cable', 2, 10, 15, 75],
  ['Straight-Bar Triceps Pushdown', 'Triceps', 'Cable', 2, 10, 15, 75],
  ['Single-Arm Overhead Cable Extension', 'Triceps', 'Cable', 2, 10, 15, 75],
];
const lowerB: Row[] = [
  ['Romanian Deadlift', 'Hamstrings', 'Barbell', 3, 8, 10, 150],
  ['Leg Press', 'Quads', 'Machine', 3, 10, 12, 120],
  ['Lying Leg Curl', 'Hamstrings', 'Machine', 3, 10, 15, 90],
  ['Bulgarian Split Squat', 'Quads', 'Dumbbell', 2, 8, 12, 120],
  ['Dumbbell Lateral Raise', 'Shoulders', 'Dumbbell', 3, 12, 20, 60],
  ['Reverse Pec Deck', 'Shoulders', 'Machine', 3, 12, 20, 75],
  ['Seated Calf Raise', 'Calves', 'Machine', 3, 10, 15, 75],
  ['Hanging Knee Raise', 'Core', 'Bodyweight', 2, 10, 15, 60],
];
export function seedData(): { exercises: Exercise[]; split: Split } {
  const rows = [...upperA, ...lowerA, ...upperB, ...lowerB];
  const extras: Row[] = [
    ['Incline Smith Press', 'Chest', 'Smith Machine', 3, 8, 12, 120],
    ['Assisted Pull-ups', 'Back', 'Machine', 3, 6, 10, 150],
    ['Weighted Pull-ups', 'Back', 'Bodyweight', 3, 6, 10, 150],
    ['Flat Dumbbell Press', 'Chest', 'Dumbbell', 3, 8, 12, 120],
    ['Machine Row', 'Back', 'Machine', 3, 8, 12, 120],
    ['Chest-Supported Row', 'Back', 'Dumbbell', 3, 6, 10, 150],
    ['High-to-Low Cable Fly', 'Chest', 'Cable', 2, 10, 15, 120],
    ['Barbell Bench Press', 'Chest', 'Barbell', 3, 6, 10, 120],
    ['Barbell Squat', 'Quads', 'Barbell', 3, 6, 10, 150],
  ];
  const exercises = [
    ...new Map(
      [...rows, ...extras].map(([name, primaryMuscle, equipment]) => [
        name,
        {
          id: seedId(name),
          name,
          primaryMuscle,
          equipment,
          secondaryMuscles: [],
          loadMode:
            name === 'Assisted Pull-ups'
              ? 'assistance'
              : name === 'Weighted Pull-ups'
                ? 'weighted-bodyweight'
                : equipment === 'Bodyweight'
                  ? 'bodyweight'
                  : 'external',
          notes: '',
          archived: false,
        } as Exercise,
      ]),
    ).values(),
  ];
  const day = (key: string, name: string, items: Row[], cardioMinutes: number) => ({
    id: seedId(key),
    name,
    isRest: !items.length,
    cardioMinutes,
    exercises: items.map(
      (
        [
          exerciseName,
          ,
          ,
          sets,
          repMin,
          repMax,
          restSeconds,
          alternative = '',
          alternativeReps = '',
        ],
        i,
      ) => ({
        id: seedId(`${key}-${i}`),
        exerciseId: seedId(exerciseName),
        sets,
        repMin,
        repMax,
        restSeconds,
        warmupSets: 0,
        notes:
          exerciseName === 'Bulgarian Split Squat'
            ? 'Reps per leg. Log the combined external load.'
            : '',
        alternative,
        alternativeReps,
      }),
    ),
  });
  return {
    exercises,
    split: {
      id: seedId('split'),
      name: '4-Day Upper / Lower — JJ',
      archived: false,
      days: [
        day('upper-a', 'Upper A', upperA, 15),
        day('lower-a', 'Lower A + Shoulders', lowerA, 10),
        day('rest-1', 'Rest', [], 0),
        day('upper-b', 'Upper B', upperB, 15),
        day('lower-b', 'Lower B + Shoulders', lowerB, 10),
        day('rest-2', 'Rest', [], 0),
        day('rest-3', 'Rest', [], 0),
      ],
    },
  };
}
export async function seedOwner(tx: Prisma.TransactionClient, userId: string) {
  const { exercises, split } = seedData();
  for (const exercise of exercises)
    await tx.exercise.upsert({
      where: { id: exercise.id },
      update: {},
      create: { ...exercise, userId },
    });
  if (!(await tx.workoutSplit.findUnique({ where: { id: split.id } })))
    await tx.workoutSplit.create({
      data: {
        id: split.id,
        name: split.name,
        userId,
        days: {
          create: split.days.map((d, position) => ({
            ...d,
            position,
            exercises: { create: d.exercises.map((e, position) => ({ ...e, position })) },
          })),
        },
      },
    });
  await tx.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId, preferences: { ...defaults, activeSplitId: split.id } },
  });
}
