CREATE TABLE "PushCredentials" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicKey" TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE TABLE "RestPushJob" (
  "subscriptionId" UUID NOT NULL PRIMARY KEY,
  "revision" DOUBLE PRECISION NOT NULL,
  "dueAt" TIMESTAMPTZ(3),
  "nextAttemptAt" TIMESTAMPTZ(3),
  "exerciseName" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "sound" BOOLEAN NOT NULL DEFAULT true,
  "test" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RestPushJob_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RestPushJob_nextAttemptAt_idx" ON "RestPushJob"("nextAttemptAt");
