// ============================================================
// Scheduler entry point.
//  - Vercel Cron hits  POST /api/cron/tick  (Bearer CRON_SECRET)
//  - Railway worker calls runSchedulerTick() on an interval
// Each tick is idempotent thanks to row locking + idempotency keys.
// ============================================================
import { Router } from 'express';
import { wrap } from '../lib/http.js';
import { requireCronSecret } from '../middleware/auth.js';
import { runSchedulerTick, pollCommentReplies } from '../services/campaign-engine.js';

export const cronRouter = Router();
cronRouter.post(
  '/tick',
  requireCronSecret,
  wrap(async (_req, res) => {
    const result = await runSchedulerTick('cron');
    // Lightweight comment-reply poll every tick (best effort).
    pollCommentReplies().catch(() => undefined);
    res.json({ ok: true, ...result });
  }),
);

cronRouter.get(
  '/tick',
  requireCronSecret,
  wrap(async (_req, res) => {
    const result = await runSchedulerTick('cron');
    res.json({ ok: true, ...result });
  }),
);
