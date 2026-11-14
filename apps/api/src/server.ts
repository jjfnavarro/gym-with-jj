import 'dotenv/config';
import { createDatabase } from './db.js';
import { createApp, logger } from './app.js';
import { createPushService, startPushWorker } from './push.js';
const db = createDatabase();
const push = createPushService(db, process.env.APP_ORIGIN ?? 'http://localhost:5173', logger);
const stopPush = startPushWorker(push, logger);
const server = createApp(db, { push }).listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () =>
  logger.info({ port: process.env.PORT ?? 3000 }, 'GYM WITH JJ listening'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    logger.info({ signal }, 'Graceful shutdown');
    stopPush();
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
