import { Router } from 'express';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { wrap } from '../lib/http.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  wrap(async (_req, res) => {
    let database: 'connected' | 'error' = 'connected';
    try {
      await db.execute(sql`select 1`);
    } catch {
      database = 'error';
    }
    const workerRunning = (globalThis as any).__PC_MISSION_WORKER__ === true;
    res.status(database === 'connected' ? 200 : 503).json({
      status: database === 'connected' ? 'ok' : 'degraded',
      database,
      worker: workerRunning ? 'running' : 'web-mode',
      ts: new Date().toISOString(),
    });
  }),
);
