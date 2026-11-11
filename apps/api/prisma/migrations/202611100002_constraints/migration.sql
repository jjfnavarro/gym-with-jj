ALTER TABLE "User" ADD CONSTRAINT "single_owner_only" CHECK ("singleton" = 1);
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "valid_workout_set" CHECK ("weightKg" >= 0 AND "reps" >= 0 AND (NOT "completed" OR "reps" > 0));
ALTER TABLE "SplitDayExercise" ADD CONSTRAINT "valid_prescription" CHECK ("sets" > 0 AND "repMin" > 0 AND "repMax" >= "repMin" AND "restSeconds" >= 0 AND "warmupSets" >= 0);
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "valid_session_status" CHECK ("status" IN ('active','paused','completed','abandoned') AND "unit" IN ('kg','lb') AND "pausedMs" >= 0 AND (("status" = 'completed') = ("finishedAt" IS NOT NULL)) AND (("status" = 'paused') = ("pausedAt" IS NOT NULL)));
CREATE UNIQUE INDEX "one_active_workout_per_owner" ON "WorkoutSession" ("userId") WHERE "status" IN ('active','paused') AND "deletedAt" IS NULL;
