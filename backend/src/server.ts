import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { migrate } from './db/migrate';
import { seedDemoData } from './db/seed';
import { logger } from './lib/logger';

async function main() {
  if (env.RUN_MIGRATIONS) await migrate(env.DATABASE_URL, (line) => logger.info(line));
  if (env.SEED_DEMO_DATA)
    await seedDemoData({ onlyIfEmpty: true, log: (line) => logger.info(line) });

  const server = createApp().listen(env.PORT, () =>
    logger.info(`API listening on port ${env.PORT}`),
  );
  // Behind a load balancer, keep idle connections open longer than it does, or it reuses a closed one.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received: finishing open requests`);
    const force = setTimeout(() => {
      logger.error('Open requests did not finish in time; exiting');
      process.exit(1);
    }, 15_000);
    force.unref();
    server.close(async () => {
      await pool.end().catch(() => undefined);
      logger.info('Stopped');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API failed to start');
  process.exit(1);
});
