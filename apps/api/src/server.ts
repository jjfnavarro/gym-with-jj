import 'dotenv/config';
import { createDatabase } from './db.js';
import { createApp, logger } from './app.js';
const db = createDatabase();
const server = createApp(db).listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () =>
  logger.info({ port: process.env.PORT ?? 3000 }, 'GYM WITH JJ listening'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    logger.info({ signal }, 'Graceful shutdown');
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
