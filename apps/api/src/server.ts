// ============================================================
// Express app factory — used by both the long-running server
// (Railway / local) and the Vercel serverless function.
// ============================================================
import express from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from './lib/rate-limit.js';
import { HttpError } from './lib/http.js';
import { recordSystemError } from './lib/audit.js';

import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { creatorsRouter } from './routes/creators.js';
import { campaignsRouter } from './routes/campaigns.js';
import { accountsRouter, oauthCallback } from './routes/accounts.js';
import { templatesRouter } from './routes/templates.js';
import { activityRouter, errorRouter } from './routes/activity.js';
import { repliesRouter } from './routes/replies.js';
import { telegramRouter } from './routes/telegram.js';
import { settingsRouter } from './routes/settings.js';
import { healthRouter } from './routes/health.js';
import { metaWebhookRouter, telegramWebhookRouter } from './routes/webhooks.js';
import { cronRouter } from './routes/cron.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Rate limiting — auth endpoints stricter than the rest.
  app.use('/api/auth/login', rateLimit(15 * 60_000, 20, 'login'));
  app.use('/api/auth/setup', rateLimit(60 * 60_000, 5, 'setup'));
  app.use('/api', rateLimit(60_000, 240, 'api'));

  // Health (no auth)
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  // Public webhooks + OAuth callback
  app.get('/api/instagram/callback', oauthCallback);
  app.use('/api/webhooks/meta', metaWebhookRouter);
  app.use('/api/telegram/webhook', telegramWebhookRouter);
  app.use('/api/cron', cronRouter);

  // Authenticated API
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/creators', creatorsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/errors', errorRouter);
  app.use('/api/replies', repliesRouter);
  app.use('/api/telegram', telegramRouter);
  app.use('/api/settings', settingsRouter);

  app.get('/api', (_req, res) => res.json({ name: 'PC Mission API', status: 'ok' }));

  // 404 + error handler
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[api] unhandled error:', message);
    recordSystemError('web', message, { context: { path: req.path } }).catch(() => undefined);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
