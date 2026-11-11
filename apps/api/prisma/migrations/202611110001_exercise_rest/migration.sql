ALTER TABLE "WorkoutSessionExercise" ADD COLUMN "exerciseRestSeconds" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "WorkoutSessionExercise" ADD CONSTRAINT "valid_exercise_rest" CHECK ("exerciseRestSeconds" >= 0 AND "exerciseRestSeconds" <= 3600);
