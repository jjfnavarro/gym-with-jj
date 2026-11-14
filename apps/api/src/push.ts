import * as webpush from 'web-push';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Only browser-vendor push gateways may receive outbound requests. Never allow
// user-supplied subscriptions to target private networks or arbitrary URLs.
export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      (url.hostname.endsWith('.push.apple.com') ||
        url.hostname === 'fcm.googleapis.com' ||
        url.hostname.endsWith('.push.services.mozilla.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
const key = (length: number) =>
  z
    .string()
    .max(100)
    .regex(/^[\w-]+={0,2}$/)
    .refine((value) => Buffer.from(value, 'base64url').length === length);
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(validPushEndpoint, 'Unsupported push service'),
  keys: z.object({ p256dh: key(65), auth: key(16) }),
});
export const pushScheduleSchema = z.object({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  delayMs: z
    .number()
    .int()
    .min(0)
    .max(4 * 60 * 60 * 1000)
    .nullable(),
  exerciseName: z.string().max(120).default(''),
  kind: z.enum(['set', 'exercise']).default('set'),
  path: z
    .string()
    .regex(/^\/(?:session\/[\da-f-]{36})?$/i)
    .default('/'),
  sound: z.boolean().default(true),
  test: z.boolean().default(false),
});
export class PushError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type PushSender = typeof webpush.sendNotification;
type Log = { warn: (data: object, message: string) => void };

export function createPushService(
  db: PrismaClient,
  origin: string,
  log: Log,
  send: PushSender = webpush.sendNotification,
) {
  let keysPromise: Promise<{ publicKey: string; privateKey: string }> | undefined;
  const keys = () => {
    if (!keysPromise) {
      const pair = webpush.generateVAPIDKeys();
      keysPromise = Promise.resolve(
        db.pushCredentials.upsert({
          where: { id: 'rest' },
          create: { id: 'rest', ...pair },
          update: {},
        }),
      );
      keysPromise.catch(() => {
        keysPromise = undefined;
      });
    }
    return keysPromise;
  };
  const owned = async (userId: string, id: string) => {
    const subscription = await db.pushSubscription.findFirst({
      where: { id, userId, enabled: true },
    });
    if (!subscription) throw new PushError(404, 'Enable Lock Screen alerts on this device again.');
    return subscription;
  };
  return {
    async config() {
      return { publicKey: (await keys()).publicKey };
    },
    async subscribe(userId: string, input: z.infer<typeof pushSubscriptionSchema>) {
      const existing = await db.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
      });
      if (existing && existing.userId !== userId)
        throw new PushError(403, 'This subscription belongs to another account.');
      return db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: { userId, endpoint: input.endpoint, ...input.keys },
        update: { ...input.keys, enabled: true },
        select: { id: true },
      });
    },
    async schedule(userId: string, id: string, input: z.infer<typeof pushScheduleSchema>) {
      await owned(userId, id);
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
        const existing = await tx.restPushJob.findUnique({ where: { subscriptionId: id } });
        if (existing && existing.revision >= input.revision)
          return { scheduled: existing.dueAt !== null, superseded: true };
        const subscription = await tx.pushSubscription.findFirst({
          where: { id, userId, enabled: true },
        });
        if (!subscription)
          throw new PushError(404, 'Enable Lock Screen alerts on this device again.');
        const dueAt = input.delayMs === null ? null : new Date(Date.now() + input.delayMs);
        const data = {
          revision: input.revision,
          dueAt,
          nextAttemptAt: dueAt,
          exerciseName: input.exerciseName,
          kind: input.kind,
          path: input.path,
          sound: input.sound,
          test: input.test,
          attempts: 0,
        };
        await tx.restPushJob.upsert({
          where: { subscriptionId: id },
          create: { subscriptionId: id, ...data },
          update: data,
        });
        return { scheduled: dueAt !== null, superseded: false };
      });
    },
    async disable(userId: string, id: string) {
      await db.$transaction(async (tx) => {
        await tx.restPushJob.updateMany({
          where: { subscriptionId: id, subscription: { userId } },
          data: { dueAt: null, nextAttemptAt: null },
        });
        await tx.pushSubscription.updateMany({ where: { id, userId }, data: { enabled: false } });
      });
    },
    async tick() {
      // PostgreSQL row locks coordinate deployment overlap / multiple replicas.
      // The queue persists across process restarts; elapsed alerts expire quickly.
      await db.$transaction(
        async (tx) => {
          const jobs = await tx.$queryRaw<Array<{ subscriptionId: string }>>`
          SELECT "subscriptionId" FROM "RestPushJob"
          WHERE "nextAttemptAt" <= NOW() AND "dueAt" IS NOT NULL
          ORDER BY "nextAttemptAt" LIMIT 5 FOR UPDATE SKIP LOCKED`;
          for (const { subscriptionId } of jobs) {
            const job = await tx.restPushJob.findUniqueOrThrow({
              where: { subscriptionId },
              include: { subscription: true },
            });
            const finish = () =>
              tx.restPushJob.update({
                where: { subscriptionId },
                data: { dueAt: null, nextAttemptAt: null },
              });
            if (
              !job.subscription.enabled ||
              !job.dueAt ||
              Date.now() - job.dueAt.getTime() > 60000
            ) {
              await finish();
              continue;
            }
            const pair = await keys();
            const payload = JSON.stringify({
              web_push: 8030,
              notification: {
                title: job.test ? 'Rest alert test' : 'Rest complete',
                body: job.test
                  ? 'Lock Screen alerts are working. Time for your next set.'
                  : `${job.kind === 'exercise' ? 'Next exercise' : 'Next set'}: ${job.exerciseName}`,
                navigate: new URL(job.path, origin).href,
                icon: '/icon-192.png',
                tag: 'jj-rest-complete',
                silent: !job.sound,
                data: { url: job.path },
              },
            });
            try {
              await send(
                {
                  endpoint: job.subscription.endpoint,
                  keys: { p256dh: job.subscription.p256dh, auth: job.subscription.auth },
                },
                payload,
                {
                  vapidDetails: {
                    subject: origin,
                    publicKey: pair.publicKey,
                    privateKey: pair.privateKey,
                  },
                  TTL: Math.max(1, Math.ceil((job.dueAt.getTime() + 60000 - Date.now()) / 1000)),
                  urgency: 'high',
                  topic: 'jj-rest-complete',
                  timeout: 5000,
                },
              );
              await finish();
            } catch (error) {
              const status =
                typeof error === 'object' && error && 'statusCode' in error
                  ? Number(error.statusCode)
                  : 0;
              log.warn({ status, attempts: job.attempts + 1 }, 'Rest push delivery failed');
              if (status === 404 || status === 410) {
                await tx.pushSubscription.update({
                  where: { id: subscriptionId },
                  data: { enabled: false },
                });
                await finish();
              } else if (job.attempts >= 3 || (status >= 400 && status < 500 && status !== 429)) {
                await finish();
              } else
                await tx.restPushJob.update({
                  where: { subscriptionId },
                  data: {
                    attempts: { increment: 1 },
                    nextAttemptAt: new Date(Date.now() + 3000 * (job.attempts + 1)),
                  },
                });
            }
          }
        },
        { timeout: 40000 },
      );
    },
  };
}
export type PushService = ReturnType<typeof createPushService>;
export function startPushWorker(service: PushService, log: Log) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await service.tick();
    } catch {
      log.warn({}, 'Rest push worker will retry');
    } finally {
      busy = false;
    }
  };
  const interval = setInterval(() => void run(), 1000);
  interval.unref();
  void run();
  return () => clearInterval(interval);
}
