import { Router } from 'express';
import { db } from '../db/client.js';
import { actionLogs, creators, instagramAccounts, systemErrors } from '../db/schema.js';
import { and, desc, eq, gte } from 'drizzle-orm';
import { wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { toActivityDTO } from './mappers.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get(
  '/',
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const creatorId = req.query.creatorId as string | undefined;
    const type = req.query.type as string | undefined;
    const conditions: any[] = [];
    if (creatorId) conditions.push(eq(actionLogs.creatorId, creatorId));
    if (type) conditions.push(eq(actionLogs.actionType, type));
    if (req.query.today === '1') {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      conditions.push(gte(actionLogs.ts, t));
    }
    const rows = await db
      .select({
        id: actionLogs.id,
        ts: actionLogs.ts,
        creatorUsername: creators.username,
        accountUsername: instagramAccounts.username,
        actionType: actionLogs.actionType,
        campaignDay: actionLogs.campaignDay,
        content: actionLogs.content,
        status: actionLogs.status,
        errorMessage: actionLogs.errorMessage,
        metadata: actionLogs.metadata,
      })
      .from(actionLogs)
      .leftJoin(creators, eq(actionLogs.creatorId, creators.id))
      .leftJoin(instagramAccounts, eq(actionLogs.accountId, instagramAccounts.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(actionLogs.ts))
      .limit(limit);
    res.json({ events: rows.map(toActivityDTO) });
  }),
);

const errorRouter = Router();
errorRouter.use(requireAuth);
errorRouter.get(
  '/',
  wrap(async (req, res) => {
    const includeResolved = req.query.resolved === '1';
    const rows = await db
      .select()
      .from(systemErrors)
      .where(includeResolved ? undefined : eq(systemErrors.resolved, false))
      .orderBy(desc(systemErrors.ts))
      .limit(100);
    res.json({
      errors: rows.map((r) => ({
        id: r.id,
        ts: r.ts.toISOString(),
        service: r.service,
        errorClass: r.errorClass,
        message: r.message,
        resolved: r.resolved,
        context: r.context,
      })),
    });
  }),
);

errorRouter.post(
  '/:id/resolve',
  wrap(async (req, res) => {
    await db.update(systemErrors).set({ resolved: true }).where(eq(systemErrors.id, req.params.id));
    res.json({ ok: true });
  }),
);

errorRouter.post(
  '/resolve-all',
  wrap(async (_req, res) => {
    await db.update(systemErrors).set({ resolved: true }).where(eq(systemErrors.resolved, false));
    res.json({ ok: true });
  }),
);

export { errorRouter };
