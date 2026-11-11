import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { existsSync } from 'node:fs';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  loginSchema,
  exerciseSchema,
  splitSchema,
  settingsSchema,
  syncSchema,
  backupSchema,
  id,
  type Settings,
} from '@gym/shared';
import { bootstrap, saveSplit, sessionData, sessionInclude, serializeSession } from './data.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}
type AuthRequest = Request & { ownerId: string; csrfToken: string; authHash: string };
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'],
});
export function createApp(
  db: PrismaClient,
  options: { origin?: string; production?: boolean; staticDir?: string } = {},
) {
  const app = express();
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const origin = options.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  try {
    if (new URL(origin).origin !== origin) throw new Error('Noncanonical origin');
  } catch {
    throw new Error('APP_ORIGIN must be an exact origin, without a path or trailing slash.');
  }
  if (production && !origin.startsWith('https://'))
    throw new Error('APP_ORIGIN must be the public HTTPS URL in production.');
  const cookieName = production ? '__Host-gym_session' : 'gym_session';
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'strict' as const,
    path: '/',
  };
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(pinoHttp({ logger }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  app.get('/api/health', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin)
      return next(new HttpError(403, 'Request origin is not allowed'));
    next();
  });
  app.post(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many login attempts. Try again in 15 minutes.' },
    }),
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      const owner = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
      const valid = owner
        ? await argon2.verify(owner.passwordHash, input.password)
        : Boolean(await argon2.hash(input.password)) && false;
      if (!owner || !valid) throw new HttpError(401, 'Email or password is incorrect');
      await db.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const token = randomBytes(32).toString('hex');
      const csrfToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 86400000);
      await db.authSession.create({
        data: { tokenHash: hash(token), userId: owner.id, csrfToken, expiresAt },
      });
      res
        .cookie(cookieName, token, { ...cookieOptions, expires: expiresAt })
        .json({ owner: { id: owner.id, name: owner.name, email: owner.email }, csrfToken });
    },
  );
  app.use('/api', async (req, res, next) => {
    const token = req.cookies[cookieName] as unknown;
    if (typeof token !== 'string') throw new HttpError(401, 'Sign in to continue');
    const auth = await db.authSession.findUnique({ where: { tokenHash: hash(token) } });
    if (!auth || auth.expiresAt.getTime() <= Date.now()) {
      res.clearCookie(cookieName, cookieOptions);
      throw new HttpError(401, 'Your session expired. Sign in again.');
    }
    Object.assign(req, {
      ownerId: auth.userId,
      csrfToken: auth.csrfToken,
      authHash: auth.tokenHash,
    });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-csrf-token'] !== auth.csrfToken
    )
      throw new HttpError(403, 'Security token expired. Reload and try again.');
    next();
  });
  const auth = (req: Request) => req as AuthRequest;
  app.get('/api/auth/me', (req, res) => res.json({ csrfToken: auth(req).csrfToken }));
  app.post('/api/auth/logout', async (req, res) => {
    await db.authSession.deleteMany({ where: { tokenHash: auth(req).authHash } });
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.get('/api/bootstrap', async (req, res) => res.json(await bootstrap(db, auth(req).ownerId)));
  app.put('/api/settings', async (req, res) => {
    const settings = settingsSchema.parse(req.body);
    if (
      settings.activeSplitId &&
      !(await db.workoutSplit.findFirst({
        where: { id: settings.activeSplitId, userId: auth(req).ownerId, archived: false },
      }))
    )
      throw new HttpError(400, 'Choose an available split');
    await db.userSettings.update({
      where: { userId: auth(req).ownerId },
      data: { preferences: settings },
    });
    res.json(settings);
  });
  app.put('/api/exercises/:id', async (req, res) => {
    const e = exerciseSchema.parse(req.body);
    if (e.id !== id.parse(req.params.id)) throw new HttpError(400, 'Exercise IDs do not match');
    const existing = await db.exercise.findUnique({ where: { id: e.id } });
    if (existing && existing.userId !== auth(req).ownerId)
      throw new HttpError(403, 'Access denied');
    res.json(
      await db.exercise.upsert({
        where: { id: e.id },
        create: { ...e, userId: auth(req).ownerId },
        update: e,
      }),
    );
  });
  app.delete('/api/exercises/:id', async (req, res) => {
    const exerciseId = id.parse(req.params.id);
    const e = await db.exercise.findFirst({ where: { id: exerciseId, userId: auth(req).ownerId } });
    if (!e) throw new HttpError(404, 'Exercise not found');
    await db.exercise.update({ where: { id: e.id }, data: { archived: true } });
    res.status(204).end();
  });
  app.put('/api/splits/:id', async (req, res) => {
    const split = splitSchema.parse(req.body);
    if (split.id !== id.parse(req.params.id)) throw new HttpError(400, 'Split IDs do not match');
    await db.$transaction((tx) => saveSplit(tx, auth(req).ownerId, split), { timeout: 20000 });
    res.json(split);
  });
  app.delete('/api/splits/:id', async (req, res) => {
    const splitId = id.parse(req.params.id);
    await db.$transaction(async (tx) => {
      const deleted = await tx.workoutSplit.deleteMany({
        where: { id: splitId, userId: auth(req).ownerId },
      });
      if (!deleted.count) throw new HttpError(404, 'Split not found');
      const prefs = await tx.userSettings.findUniqueOrThrow({
        where: { userId: auth(req).ownerId },
      });
      const settings = settingsSchema.parse(prefs.preferences);
      if (settings.activeSplitId === splitId)
        await tx.userSettings.update({
          where: { userId: auth(req).ownerId },
          data: { preferences: { ...settings, activeSplitId: null } },
        });
    });
    res.status(204).end();
  });
  app.post('/api/sessions/sync', async (req, res) => {
    const { session, baseVersion, mutationId } = syncSchema.parse(req.body);
    const userId = auth(req).ownerId;
    const result = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
        const existing = await tx.workoutSession.findUnique({
          where: { id: session.id },
          include: sessionInclude,
        });
        if (existing && existing.userId !== userId) throw new HttpError(403, 'Access denied');
        if (existing?.deletedAt)
          throw new HttpError(
            409,
            'This workout was deleted on another device. Your local copy has been preserved.',
          );
        if (existing?.lastMutationId === mutationId) return serializeSession(existing);
        if ((existing?.version ?? 0) !== baseVersion)
          throw new HttpError(
            409,
            'This workout changed on another device. Your local copy has been preserved.',
            existing ? serializeSession(existing) : null,
          );
        if (existing && (existing.status === 'completed' || existing.status === 'abandoned'))
          throw new HttpError(409, 'Finalized workout data is protected. Edit notes from History.');
        if (session.status === 'active' || session.status === 'paused') {
          const another = await tx.workoutSession.findFirst({
            where: {
              userId,
              id: { not: session.id },
              deletedAt: null,
              status: { in: ['active', 'paused'] },
            },
          });
          if (another)
            throw new HttpError(
              409,
              'Another workout is already active on the server. Your local copy has been preserved.',
            );
        }
        if (existing) {
          await tx.workoutSessionExercise.deleteMany({ where: { sessionId: session.id } });
          await tx.cardioEntry.deleteMany({ where: { sessionId: session.id } });
        }
        const data = sessionData(session);
        const row = existing
          ? await tx.workoutSession.update({
              where: { id: session.id },
              data: { ...data, version: { increment: 1 }, lastMutationId: mutationId },
              include: sessionInclude,
            })
          : await tx.workoutSession.create({
              data: { ...data, userId, version: 1, lastMutationId: mutationId },
              include: sessionInclude,
            });
        return serializeSession(row);
      },
      { timeout: 20000 },
    );
    res.json(result);
  });
  app.patch('/api/sessions/:id/notes', async (req, res) => {
    const { notes, version } = z
      .object({ notes: z.string().max(4000), version: z.number().int().positive() })
      .parse(req.body);
    const updated = await db.workoutSession.updateMany({
      where: {
        id: id.parse(req.params.id),
        userId: auth(req).ownerId,
        version,
        deletedAt: null,
        status: 'completed',
      },
      data: { notes, version: { increment: 1 } },
    });
    if (!updated.count)
      throw new HttpError(409, 'This workout changed. Refresh before editing notes.');
    res.status(204).end();
  });
  app.delete('/api/sessions/:id', async (req, res) => {
    const { version } = z.object({ version: z.number().int().positive() }).parse(req.body);
    const updated = await db.workoutSession.updateMany({
      where: { id: id.parse(req.params.id), userId: auth(req).ownerId, version, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (!updated.count) throw new HttpError(409, 'This workout changed. Refresh before deleting.');
    res.status(204).end();
  });
  app.post('/api/backups/import', async (req, res) => {
    const backup = backupSchema.parse(req.body);
    const userId = auth(req).ownerId;
    if (backup.sessions.some((s) => s.status !== 'completed' && s.status !== 'abandoned'))
      throw new HttpError(
        400,
        'Import completed history only. Finish or remove unfinished workouts from the backup first.',
      );
    const imported = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
        for (const e of backup.exercises) {
          const existing = await tx.exercise.findUnique({ where: { id: e.id } });
          if (existing && existing.userId !== userId) throw new HttpError(403, 'Access denied');
          await tx.exercise.upsert({ where: { id: e.id }, create: { ...e, userId }, update: {} });
        }
        for (const split of backup.splits)
          if (!(await tx.workoutSplit.findUnique({ where: { id: split.id } })))
            await saveSplit(tx, userId, split);
        let count = 0;
        for (const session of backup.sessions) {
          if (await tx.workoutSession.findUnique({ where: { id: session.id } })) continue;
          await tx.workoutSession.create({
            data: { ...sessionData(session), userId, lastMutationId: randomUUID() },
          });
          count++;
        }
        return count;
      },
      { timeout: 60000 },
    );
    res.json({
      imported,
      message: 'Merged new records. Existing records and settings were preserved.',
    });
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API route not found')));
  const staticDir = options.staticDir ?? resolve('apps/web/dist');
  if (existsSync(staticDir)) {
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders: (res, filePath) => {
          // Only Vite's fingerprinted assets are safe to cache across releases.
          // The service worker and HTML must revalidate to discover new builds.
          res.setHeader(
            'Cache-Control',
            production && filePath.includes(`${sep}assets${sep}`)
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          );
        },
      }),
    );
    app.get('/{*path}', (req, res) => {
      if (extname(req.path)) return res.status(404).type('text/plain').send('File not found');
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(resolve(staticDir, 'index.html'));
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large')
      return res
        .status(413)
        .json({ error: 'The request is too large. Backups must be smaller than 15 MB.' });
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: 'Please check the entered values', issues: error.issues });
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: error.message, detail: error.detail });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return res
        .status(409)
        .json({ error: 'This record already exists. Refresh before retrying.' });
    if (error instanceof Error && ['UNKNOWN_EXERCISE', 'FORBIDDEN'].includes(error.message))
      return res.status(400).json({ error: 'The template references an unavailable record' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' });
    logger.error({ err: error }, 'Request failed');
    res.status(500).json({
      error: 'The server could not save this change. Your local workout remains on this device.',
    });
  });
  return app;
}
