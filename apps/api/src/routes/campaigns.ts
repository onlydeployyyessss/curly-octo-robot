import { Router } from 'express';
import { db } from '../db/client.js';
import {
  campaignDays,
  campaigns,
  creators,
  instagramAccounts,
  scheduledActions,
} from '../db/schema.js';
import { desc, eq, inArray } from 'drizzle-orm';
import { wrap, HttpError } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { campaignConfigSchema } from '@pc/shared';
import { requireAuth } from '../middleware/auth.js';
import { toCampaignDTO } from './mappers.js';
import { audit } from '../lib/audit.js';
import { updateSettings } from '../lib/settings.js';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.get(
  '/',
  wrap(async (req, res) => {
    const rows = await db
      .select({
        id: campaigns.id,
        creatorId: campaigns.creatorId,
        creatorUsername: creators.username,
        accountId: campaigns.accountId,
        accountUsername: instagramAccounts.username,
        status: campaigns.status,
        currentDay: campaigns.currentDay,
        maxDays: campaigns.maxDays,
        dmEnabled: campaigns.dmEnabled,
        commentEnabled: campaigns.commentEnabled,
        scheduledTime: campaigns.scheduledTime,
        startedAt: campaigns.startedAt,
        completedAt: campaigns.completedAt,
        pausedAt: campaigns.pausedAt,
        stoppedAt: campaigns.stoppedAt,
      })
      .from(campaigns)
      .leftJoin(creators, eq(campaigns.creatorId, creators.id))
      .leftJoin(instagramAccounts, eq(campaigns.accountId, instagramAccounts.id))
      .orderBy(desc(campaigns.createdAt))
      .limit(300);

    const campaignIds = rows.map((r) => r.id);
    const days = campaignIds.length
      ? await db.select().from(campaignDays).where(inArray(campaignDays.campaignId, campaignIds))
      : [];
    const byCampaign = new Map<string, typeof days>();
    for (const d of days) {
      const list = byCampaign.get(d.campaignId) ?? [];
      list.push(d);
      byCampaign.set(d.campaignId, list);
    }
    res.json({ campaigns: rows.map((r) => toCampaignDTO(r, byCampaign.get(r.id) ?? [])) });
  }),
);

campaignsRouter.get(
  '/:creatorId',
  wrap(async (req, res) => {
    const [campaign] = await db
      .select({
        id: campaigns.id,
        creatorId: campaigns.creatorId,
        creatorUsername: creators.username,
        accountId: campaigns.accountId,
        accountUsername: instagramAccounts.username,
        status: campaigns.status,
        currentDay: campaigns.currentDay,
        maxDays: campaigns.maxDays,
        dmEnabled: campaigns.dmEnabled,
        commentEnabled: campaigns.commentEnabled,
        scheduledTime: campaigns.scheduledTime,
        startedAt: campaigns.startedAt,
        completedAt: campaigns.completedAt,
        pausedAt: campaigns.pausedAt,
        stoppedAt: campaigns.stoppedAt,
      })
      .from(campaigns)
      .leftJoin(creators, eq(campaigns.creatorId, creators.id))
      .leftJoin(instagramAccounts, eq(campaigns.accountId, instagramAccounts.id))
      .where(eq(campaigns.creatorId, req.params.creatorId))
      .limit(1);
    if (!campaign) throw new HttpError(404, 'No campaign for this creator');
    const days = await db.select().from(campaignDays).where(eq(campaignDays.campaignId, campaign.id));
    res.json({ campaign: toCampaignDTO(campaign, days) });
  }),
);

// Update default campaign configuration (applies to future campaigns + day templates)
campaignsRouter.put(
  '/config',
  validateBody(campaignConfigSchema),
  wrap(async (req, res) => {
    const { maxDays, dmTime, dmEnabled, commentEnabled, templates } = req.body;
    await updateSettings({
      defaultMaxDays: maxDays,
      defaultDmTime: dmTime,
    });

    // Upsert default approved templates per day/channel.
    const { messageTemplates } = await import('../db/schema.js');
    for (const t of templates) {
      for (const channel of ['dm', 'comment'] as const) {
        const content = (channel === 'dm' ? t.dm : t.comment).trim();
        if (!content) continue;
        const rows = await db
          .select()
          .from(messageTemplates)
          .where(eq(messageTemplates.channel, channel));
        const match = rows.find((r) => r.dayNumber === t.dayNumber);
        if (match) {
          await db
            .update(messageTemplates)
            .set({ content, updatedAt: new Date(), approved: true })
            .where(eq(messageTemplates.id, match.id));
        } else {
          await db.insert(messageTemplates).values({
            name: `Day ${t.dayNumber} ${channel}`,
            channel,
            dayNumber: t.dayNumber,
            content,
            approved: true,
          });
        }
      }
    }

    // Apply dm/comment defaults to waiting campaigns
    await db
      .update(campaigns)
      .set({ dmEnabled, commentEnabled, maxDays, scheduledTime: dmTime })
      .where(eq(campaigns.status, 'waiting'));

    await audit(req, 'campaign_config_updated', 'settings', undefined, {
      maxDays,
      dmTime,
      dmEnabled,
      commentEnabled,
    });
    res.json({ ok: true });
  }),
);

// Upcoming scheduled actions (queue visibility)
campaignsRouter.get(
  '/queue/upcoming',
  wrap(async (_req, res) => {
    const rows = await db
      .select({
        id: scheduledActions.id,
        idempotencyKey: scheduledActions.idempotencyKey,
        type: scheduledActions.type,
        creatorUsername: creators.username,
        campaignDay: scheduledActions.campaignDay,
        scheduledAt: scheduledActions.scheduledAt,
        status: scheduledActions.status,
        attempts: scheduledActions.attempts,
        lastError: scheduledActions.lastError,
      })
      .from(scheduledActions)
      .leftJoin(creators, eq(scheduledActions.creatorId, creators.id))
      .where(inArray(scheduledActions.status, ['pending', 'locked', 'failed']))
      .orderBy(scheduledActions.scheduledAt)
      .limit(100);
    res.json({
      queue: rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt.toISOString() })),
    });
  }),
);
