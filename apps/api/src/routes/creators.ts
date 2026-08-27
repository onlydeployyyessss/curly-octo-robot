import { Router } from 'express';
import { db } from '../db/client.js';
import {
  actionLogs,
  campaigns,
  creators,
  excludedCreators,
  instagramAccounts,
  replies,
} from '../db/schema.js';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { wrap, HttpError, normalizeUsername } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { createCreatorSchema, updateCreatorSchema, campaignControlSchema } from '@pc/shared';
import { requireAuth } from '../middleware/auth.js';
import { toCreatorDTO } from './mappers.js';
import { audit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import {
  excludeCreator,
  pauseCampaign,
  resumeCampaign,
  skipDay,
  startCampaign,
  stopCampaign,
  logActivity,
} from '../services/campaign-engine.js';

export const creatorsRouter = Router();
creatorsRouter.use(requireAuth);

creatorsRouter.get(
  '/',
  wrap(async (req, res) => {
    const filter = (req.query.status as string) || 'all';
    const search = (req.query.q as string) || '';
    const conditions: any[] = [];
    if (filter !== 'all' && filter) {
      if (filter === 'replied' || filter === 'positive' || filter === 'maybe' || filter === 'declined' || filter === 'blocked') {
        conditions.push(eq(creators.responseStatus, filter));
      } else {
        conditions.push(eq(creators.status, filter));
      }
    }
    if (search) {
      conditions.push(ilike(creators.username, `%${normalizeUsername(search)}%`));
    }
    const rows = await db
      .select({
        id: creators.id,
        username: creators.username,
        profileUrl: creators.profileUrl,
        igId: creators.igId,
        accountId: creators.accountId,
        accountUsername: instagramAccounts.username,
        status: creators.status,
        responseStatus: creators.responseStatus,
        startDate: creators.startDate,
        currentDay: creators.currentDay,
        maxDays: creators.maxDays,
        dmEnabled: creators.dmEnabled,
        commentEnabled: creators.commentEnabled,
        notes: creators.notes,
        excluded: creators.excluded,
        lastInteractionAt: creators.lastInteractionAt,
        lastDmAt: creators.lastDmAt,
        lastCommentAt: creators.lastCommentAt,
        lastResponseAt: creators.lastResponseAt,
        createdAt: creators.createdAt,
      })
      .from(creators)
      .leftJoin(instagramAccounts, eq(creators.accountId, instagramAccounts.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(creators.createdAt))
      .limit(500);
    res.json({ creators: rows.map(toCreatorDTO) });
  }),
);

creatorsRouter.post(
  '/',
  validateBody(createCreatorSchema),
  wrap(async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const profileUrl =
      req.body.profileUrl ||
      `https://www.instagram.com/${username}/`;
    const settings = await getSettings();

    const [created] = await db
      .insert(creators)
      .values({
        username,
        profileUrl,
        igId: req.body.igId || null,
        accountId: req.body.accountId ?? null,
        maxDays: req.body.maxDays ?? settings.defaultMaxDays,
        dmEnabled: req.body.dmEnabled ?? true,
        commentEnabled: req.body.commentEnabled ?? true,
        notes: req.body.notes || null,
        status: 'waiting',
      })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const [existing] = await db.select().from(creators).where(eq(creators.username, username)).limit(1);
      return res.status(200).json({ creator: toCreatorDTO(existing), existed: true });
    }

    await audit(req, 'creator_added', 'creator', created.id, { username });

    // "Apply campaign to eligible creators I add"
    const autoStart = req.body.autoStart ?? settings.autoApplyCampaign;
    if (autoStart) {
      const [excluded] = await db
        .select()
        .from(excludedCreators)
        .where(eq(excludedCreators.username, username))
        .limit(1);
      if (!excluded) {
        try {
          await startCampaign(created.id, { accountId: req.body.accountId ?? null });
        } catch (err) {
          await logActivity({
            creatorId: created.id,
            actionType: 'error',
            status: 'failed',
            errorMessage: `Auto-start failed: ${(err as Error).message}`,
          });
        }
      }
    }

    const [full] = await db
      .select({
        id: creators.id,
        username: creators.username,
        profileUrl: creators.profileUrl,
        igId: creators.igId,
        accountId: creators.accountId,
        accountUsername: instagramAccounts.username,
        status: creators.status,
        responseStatus: creators.responseStatus,
        startDate: creators.startDate,
        currentDay: creators.currentDay,
        maxDays: creators.maxDays,
        dmEnabled: creators.dmEnabled,
        commentEnabled: creators.commentEnabled,
        notes: creators.notes,
        excluded: creators.excluded,
        lastInteractionAt: creators.lastInteractionAt,
        lastDmAt: creators.lastDmAt,
        lastCommentAt: creators.lastCommentAt,
        lastResponseAt: creators.lastResponseAt,
        createdAt: creators.createdAt,
      })
      .from(creators)
      .leftJoin(instagramAccounts, eq(creators.accountId, instagramAccounts.id))
      .where(eq(creators.id, created.id))
      .limit(1);
    res.status(201).json({ creator: toCreatorDTO(full) });
  }),
);

creatorsRouter.patch(
  '/:id',
  validateBody(updateCreatorSchema),
  wrap(async (req, res) => {
    const [creator] = await db.select().from(creators).where(eq(creators.id, req.params.id)).limit(1);
    if (!creator) throw new HttpError(404, 'Creator not found');
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['notes', 'accountId', 'dmEnabled', 'commentEnabled', 'maxDays', 'status', 'responseStatus']) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await db.update(creators).set(patch).where(eq(creators.id, creator.id));
    await audit(req, 'creator_updated', 'creator', creator.id, patch);
    res.json({ ok: true });
  }),
);

creatorsRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    await db.delete(creators).where(eq(creators.id, req.params.id));
    await audit(req, 'creator_deleted', 'creator', req.params.id);
    res.json({ ok: true });
  }),
);

// Campaign controls: start | pause | resume | stop | skip_day | restart | exclude | include
creatorsRouter.post(
  '/:id/control',
  validateBody(campaignControlSchema),
  wrap(async (req, res) => {
    const [creator] = await db.select().from(creators).where(eq(creators.id, req.params.id)).limit(1);
    if (!creator) throw new HttpError(404, 'Creator not found');
    const { action } = req.body;
    switch (action) {
      case 'start':
      case 'restart':
        await startCampaign(creator.id, { restart: action === 'restart' });
        break;
      case 'pause':
        await pauseCampaign(creator.id);
        break;
      case 'resume':
        await resumeCampaign(creator.id);
        break;
      case 'stop':
        await stopCampaign(creator.id);
        break;
      case 'skip_day':
        await skipDay(creator.id);
        break;
      case 'exclude':
        await excludeCreator(creator.id);
        break;
      case 'include':
        await db
          .delete(excludedCreators)
          .where(eq(excludedCreators.username, creator.username));
        await db.update(creators).set({ excluded: false, updatedAt: new Date() }).where(eq(creators.id, creator.id));
        break;
    }
    await audit(req, `campaign_${action}`, 'creator', creator.id);
    res.json({ ok: true });
  }),
);

// Conversation view: outbound activity + inbound replies
creatorsRouter.get(
  '/:id/conversation',
  wrap(async (req, res) => {
    const [creator] = await db.select().from(creators).where(eq(creators.id, req.params.id)).limit(1);
    if (!creator) throw new HttpError(404, 'Creator not found');
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.creatorId, creator.id)).limit(1);
    const logs = await db
      .select({
        id: actionLogs.id,
        ts: actionLogs.ts,
        actionType: actionLogs.actionType,
        content: actionLogs.content,
        status: actionLogs.status,
        campaignDay: actionLogs.campaignDay,
        errorMessage: actionLogs.errorMessage,
      })
      .from(actionLogs)
      .where(and(eq(actionLogs.creatorId, creator.id), inArray(actionLogs.actionType, ['dm_sent', 'comment_posted', 'message_prepared', 'dm_received', 'comment_received', 'manual_action_required'])))
      .orderBy(asc(actionLogs.ts))
      .limit(200);
    const replyRows = await db
      .select({
        id: replies.id,
        ts: replies.ts,
        platform: replies.platform,
        text: replies.text,
        ourText: replies.ourText,
        mediaRef: replies.mediaRef,
        sentiment: replies.sentiment,
      })
      .from(replies)
      .where(eq(replies.creatorId, creator.id))
      .orderBy(asc(replies.ts))
      .limit(100);

    const thread = [
      ...logs
        .filter((l) => l.actionType !== 'message_prepared')
        .map((l) => ({
          id: l.id,
          ts: l.ts.toISOString(),
          direction: l.actionType === 'dm_received' || l.actionType === 'comment_received' ? 'in' : 'out',
          channel: l.actionType.startsWith('comment') ? 'comment' : 'dm',
          text: l.content ?? '',
          status: l.status,
          day: l.campaignDay,
        })),
      ...replyRows.map((r) => ({
        id: r.id,
        ts: r.ts.toISOString(),
        direction: 'in',
        channel: r.platform,
        text: r.text,
        status: 'success',
        day: null,
        sentiment: r.sentiment,
        ourText: r.ourText,
        mediaRef: r.mediaRef,
      })),
    ].sort((a, b) => a.ts.localeCompare(b.ts));

    res.json({ creator: toCreatorDTO(creator), campaignDay: campaign?.currentDay ?? 0, thread });
  }),
);

creatorsRouter.get(
  '/exclusions',
  wrap(async (_req, res) => {
    const rows = await db.select().from(excludedCreators).orderBy(desc(excludedCreators.createdAt));
    res.json({ exclusions: rows.map((r) => ({ username: r.username, reason: r.reason, createdAt: r.createdAt.toISOString() })) });
  }),
);

void or;
void sql;
