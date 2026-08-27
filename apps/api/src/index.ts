// ============================================================
// Long-running server entry (local dev / Railway web service).
// Serves the dashboard API and, when RUN_WORKER=true, also runs
// the scheduler + Telegram polling in the same process.
// ============================================================
import { createApp } from './server.js';
import { env } from './env.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './db/client.js';
import { ensureDefaults } from './lib/settings.js';
import { seedEssentials } from './db/bootstrap.js';
import { runSchedulerTick, pollCommentReplies } from './services/campaign-engine.js';
import { startPolling } from './services/telegram.js';

async function main() {
  // Auto-migrate on boot (idempotent).
  try {
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
    console.log('[db] migrations up to date');
  } catch (err) {
    console.warn('[db] migration skipped:', (err as Error).message);
  }
  await ensureDefaults();
  await seedEssentials();

  const app = createApp();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`🚀 PC Mission API listening on http://0.0.0.0:${env.port}`);
    console.log(`   mockExternal=${env.mockExternal} runWorker=${env.runWorker}`);
  });

  if (env.runWorker) {
    (globalThis as any).__PC_MISSION_WORKER__ = true;
    console.log('[worker] embedded worker started');
    startPolling().catch(() => undefined);
    const tick = async () => {
      try {
        await runSchedulerTick('embedded');
        await pollCommentReplies().catch(() => undefined);
      } catch (err) {
        console.error('[worker] tick failed:', err);
      }
    };
    tick();
    setInterval(tick, Number(process.env.WORKER_TICK_MS ?? 30_000)).unref();
  }
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
