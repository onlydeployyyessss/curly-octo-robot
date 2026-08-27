// ============================================================
// Standalone worker (Railway pc-mission-worker service).
// Runs:
//   - scheduler tick loop (due actions, retries, backoff)
//   - daily report generation
//   - Telegram long polling (when no webhook is configured)
//   - comment reply polling (best effort)
// ============================================================
import { runSchedulerTick, pollCommentReplies } from './services/campaign-engine.js';
import { startPolling } from './services/telegram.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './db/client.js';
import { ensureDefaults } from './lib/settings.js';
import { seedEssentials } from './db/bootstrap.js';

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 30_000);
const workerId = `worker-${process.env.RAILWAY_REPLICA_ID ?? process.pid}`;

(globalThis as any).__PC_MISSION_WORKER__ = true;

async function main() {
  console.log(`[worker] starting (${workerId}), tick every ${TICK_MS}ms`);
  try {
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
    console.log('[worker] migrations applied');
  } catch (err) {
    console.warn('[worker] migration step skipped:', (err as Error).message);
  }
  await ensureDefaults();
  await seedEssentials();

  startPolling().catch((err) => console.error('[worker] telegram polling failed:', err.message));

  // Immediate first tick, then loop.
  const tick = async () => {
    try {
      const r = await runSchedulerTick(workerId);
      if (r.claimed > 0) console.log(`[worker] tick: claimed ${r.claimed}, processed ${r.processed}`);
      await pollCommentReplies().catch(() => undefined);
    } catch (err) {
      console.error('[worker] tick failed:', err);
    }
  };
  await tick();
  setInterval(tick, TICK_MS).unref();

  // Keep alive.
  process.on('SIGTERM', async () => {
    console.log('[worker] shutting down');
    await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
