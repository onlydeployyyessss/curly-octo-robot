// ============================================================
// Campaign engine: per-creator multi-day outreach state machine.
//
// Reliability rules:
//  - Every scheduled action carries a UNIQUE idempotency key.
//  - Due actions are claimed atomically with FOR UPDATE SKIP LOCKED
//    so two workers (or a Vercel cron + worker) never double-send.
//  - Transient failures retry with exponential backoff; permanent
//    failures (expired OAuth, missing permission, blocked, invalid
//    creator...) are never retried indefinitely.
//  - A creator reply immediately pauses/cancels all future outreach.
// ============================================================
import { db } from '../db/client.js';
import {
  actionLogs,
  campaignDays,
  campaigns,
  creators,
  excludedCreators,
  instagramAccounts,
  messageTemplates,
  scheduledActions,
} from '../db/schema.js';
import { and, desc, eq, or, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import {
  DEFAULT_COMMENT_TEMPLATES,
  DEFAULT_DM_TEMPLATES,
  PERMANENT_ERROR_CLASSES,
  type ErrorClass,
} from '@pc/shared';
import { decrypt } from '../lib/crypto.js';
import { ExternalApiError } from '../lib/http.js';
import { recordSystemError } from '../lib/audit.js';
import { getSettings, updateSettings } from '../lib/settings.js';
import {
  getCreatorMedia,
  postComment,
  resolveCreatorIgId,
  sendDirectMessage,
} from './instagram.js';
import { personalizeMessage } from './openrouter.js';
import { buildDailyReport } from './reports.js';
import { sendTelegramIfEnabled, resolveChatId } from './telegram-helper.js';
import { dailyReports, telegramSettings } from '../db/schema.js';
import { handleInboundReply } from './replies.js';

// Re-export for convenience
export { getLatestErrors } from './stats.js';

// ---------- Activity log ----------
export async function logActivity(opts: {
  creatorId?: string | null;
  accountId?: string | null;
  campaignId?: string | null;
  actionType: string;
  campaignDay?: number | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: 'success' | 'failed' | 'info';
  errorMessage?: string | null;
  idempotencyKey?: string | null;
}): Promise<void> {
  await db.insert(actionLogs).values({
    creatorId: opts.creatorId ?? null,
    accountId: opts.accountId ?? null,
    campaignId: opts.campaignId ?? null,
    actionType: opts.actionType,
    campaignDay: opts.campaignDay ?? null,
    content: opts.content ?? null,
    metadata: opts.metadata ?? null,
    status: opts.status ?? 'success',
    errorMessage: opts.errorMessage ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
  });
}

// ---------- Templates ----------
async function getApprovedTemplate(channel: 'dm' | 'comment', dayNumber: number): Promise<string | null> {
  const [tpl] = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.channel, channel),
        eq(messageTemplates.dayNumber, dayNumber),
        eq(messageTemplates.approved, true),
      ),
    )
    .limit(1);
  return tpl?.content ?? null;
}

export async function resolveMessage(
  channel: 'dm' | 'comment',
  dayNumber: number,
  fallback: string,
): Promise<string> {
  const custom = await getApprovedTemplate(channel, dayNumber);
  if (custom && custom.trim()) return custom.trim();
  const defaults = channel === 'dm' ? DEFAULT_DM_TEMPLATES : DEFAULT_COMMENT_TEMPLATES;
  return defaults[dayNumber] ?? fallback;
}

function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// ---------- Scheduling helpers ----------
async function scheduleAction(opts: {
  type: 'dm' | 'comment' | 'check_replies';
  creatorId: string;
  campaignId: string;
  accountId: string | null;
  campaignDay: number;
  when: Date;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const key = `${opts.type}:${opts.creatorId}:day${opts.campaignDay}:${dateKey(opts.when)}`;
  await db
    .insert(scheduledActions)
    .values({
      idempotencyKey: key,
      type: opts.type,
      creatorId: opts.creatorId,
      campaignId: opts.campaignId,
      accountId: opts.accountId,
      campaignDay: opts.campaignDay,
      scheduledAt: opts.when,
      payload: opts.payload ?? {},
      status: 'pending',
    })
    .onConflictDoNothing();
}

function nextOccurrence(time: string, from = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------- Campaign lifecycle ----------
export async function startCampaign(
  creatorId: string,
  options: { accountId?: string | null; restart?: boolean } = {},
): Promise<void> {
  const settings = await getSettings();
  const creator = await db.query.creators.findFirst({ where: eq(creators.id, creatorId) });
  if (!creator) throw new Error('Creator not found');

  const [excluded] = await db
    .select()
    .from(excludedCreators)
    .where(eq(excludedCreators.username, creator.username))
    .limit(1);
  if (excluded || creator.excluded) {
    throw new Error('Creator is on the exclusion list — campaign not started.');
  }

  const accountId = options.accountId ?? creator.accountId ?? (await pickAccountId());
  if (!accountId) throw new Error('Connect an Instagram account first.');

  let campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.creatorId, creatorId) });
  const maxDays = creator.maxDays || settings.defaultMaxDays;

  if (campaign && !options.restart) {
    if (['active', 'paused'].includes(campaign.status)) return;
    // resume a stopped/completed campaign
    await db
      .update(campaigns)
      .set({ status: 'active', pausedAt: null, stoppedAt: null, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));
  } else {
    if (campaign) {
      // restart: wipe days and pending actions
      await db.delete(campaignDays).where(eq(campaignDays.campaignId, campaign.id));
      await db
        .delete(scheduledActions)
        .where(and(eq(scheduledActions.campaignId, creatorId), inArray(scheduledActions.status, ['pending', 'locked', 'failed'])));
      await db
        .update(campaigns)
        .set({
          status: 'active',
          currentDay: 0,
          maxDays,
          dmEnabled: creator.dmEnabled,
          commentEnabled: creator.commentEnabled,
          accountId,
          startedAt: new Date(),
          completedAt: null,
          pausedAt: null,
          stoppedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id));
    } else {
      [campaign] = await db
        .insert(campaigns)
        .values({
          creatorId,
          accountId,
          status: 'active',
          currentDay: 0,
          maxDays,
          dmEnabled: creator.dmEnabled,
          commentEnabled: creator.commentEnabled,
          scheduledTime: settings.defaultDmTime,
          stopConditions: {
            onReply: settings.stopOnReply,
            onPositive: settings.stopOnPositive,
            onDecline: settings.stopOnDecline,
          },
          startedAt: new Date(),
        })
        .returning();
    }
  }

  // Build day rows
  const existingDays = await db.select().from(campaignDays).where(eq(campaignDays.campaignId, campaign!.id));
  if (existingDays.length === 0) {
    await db.insert(campaignDays).values(
      Array.from({ length: maxDays }, (_, i) => ({
        campaignId: campaign!.id,
        dayNumber: i + 1,
        dmEnabled: creator.dmEnabled,
        commentEnabled: creator.commentEnabled,
        dmContent: DEFAULT_DM_TEMPLATES[i + 1] ?? `Day ${i + 1} asking for a PC 🙏`,
        commentContent: DEFAULT_COMMENT_TEMPLATES[i + 1] ?? `Day ${i + 1} asking for a PC 🙏`,
      })),
    );
  }

  await db
    .update(creators)
    .set({ status: 'active', startDate: new Date().toISOString().slice(0, 10), currentDay: 1, accountId, updatedAt: new Date() })
    .where(eq(creators.id, creatorId));

  // Day 1 DM — due immediately so the worker picks it up.
  await scheduleAction({
    type: 'dm',
    creatorId,
    campaignId: campaign!.id,
    accountId,
    campaignDay: 1,
    when: new Date(),
  });

  await logActivity({
    creatorId,
    accountId,
    campaignId: campaign!.id,
    actionType: options.restart ? 'campaign_restarted' : 'campaign_started',
    content: `Campaign started — ${maxDays} day plan.`,
    status: 'info',
  });
}

async function pickAccountId(): Promise<string | null> {
  const [acc] = await db
    .select({ id: instagramAccounts.id })
    .from(instagramAccounts)
    .where(eq(instagramAccounts.status, 'connected'))
    .limit(1);
  return acc?.id ?? null;
}

export async function pauseCampaign(creatorId: string): Promise<void> {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.creatorId, creatorId) });
  if (!campaign) return;
  await db.update(campaigns).set({ status: 'paused', pausedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
  await db.update(creators).set({ status: 'paused', updatedAt: new Date() }).where(eq(creators.id, creatorId));
  await logActivity({ creatorId, campaignId: campaign.id, actionType: 'campaign_paused', content: 'Manually paused.', status: 'info' });
}

export async function resumeCampaign(creatorId: string): Promise<void> {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.creatorId, creatorId) });
  if (!campaign) return startCampaign(creatorId);
  const creator = await db.query.creators.findFirst({ where: eq(creators.id, creatorId) });
  if (creator && creator.responseStatus !== 'none') {
    throw new Error('Creator has replied — automation stays paused out of respect. Use Restart to begin a new campaign.');
  }
  await db.update(campaigns).set({ status: 'active', pausedAt: null, updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
  await db.update(creators).set({ status: 'active', updatedAt: new Date() }).where(eq(creators.id, creatorId));
  // Re-arm the next pending day if nothing is queued.
  const nextDay = campaign.currentDay + 1;
  const queued = await db
    .select({ id: scheduledActions.id })
    .from(scheduledActions)
    .where(and(eq(scheduledActions.creatorId, creatorId), eq(scheduledActions.status, 'pending')))
    .limit(1);
  if (queued.length === 0 && nextDay <= campaign.maxDays) {
    await scheduleAction({
      type: 'dm',
      creatorId,
      campaignId: campaign.id,
      accountId: campaign.accountId,
      campaignDay: nextDay,
      when: new Date(),
    });
  }
  await logActivity({ creatorId, campaignId: campaign.id, actionType: 'campaign_resumed', content: 'Manually resumed.', status: 'info' });
}

export async function stopCampaign(creatorId: string): Promise<void> {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.creatorId, creatorId) });
  if (!campaign) return;
  await db.update(campaigns).set({ status: 'stopped', stoppedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
  await db.update(creators).set({ status: 'stopped', updatedAt: new Date() }).where(eq(creators.id, creatorId));
  await db
    .update(scheduledActions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(scheduledActions.creatorId, creatorId), inArray(scheduledActions.status, ['pending', 'locked', 'failed'])));
  await logActivity({ creatorId, campaignId: campaign.id, actionType: 'campaign_stopped', content: 'Campaign stopped.', status: 'info' });
}

export async function skipDay(creatorId: string): Promise<void> {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.creatorId, creatorId) });
  if (!campaign) throw new Error('No campaign for this creator.');
  const dayNumber = campaign.currentDay;
  await db
    .update(campaignDays)
    .set({ status: 'skipped' })
    .where(and(eq(campaignDays.campaignId, campaign.id), eq(campaignDays.dayNumber, dayNumber)));
  await logActivity({ creatorId, campaignId: campaign.id, actionType: 'day_skipped', campaignDay: dayNumber, content: `Day ${dayNumber} skipped.`, status: 'info' });
  await advanceCampaign(campaign.id, creatorId, campaign.accountId, dayNumber);
}

export async function excludeCreator(creatorId: string, reason = 'Manual exclusion'): Promise<void> {
  const creator = await db.query.creators.findFirst({ where: eq(creators.id, creatorId) });
  if (!creator) return;
  await db
    .insert(excludedCreators)
    .values({ username: creator.username, reason })
    .onConflictDoNothing();
  await db.update(creators).set({ excluded: true, status: 'stopped', updatedAt: new Date() }).where(eq(creators.id, creatorId));
  await stopCampaign(creatorId);
  await logActivity({ creatorId, actionType: 'creator_excluded', content: reason, status: 'info' });
}

export async function setAutomationGlobal(enabled: boolean): Promise<void> {
  await updateSettings({ automationEnabled: enabled });
  if (!enabled) {
    // Pause every active campaign; pending actions stay queued but are
    // skipped by the worker while automation is off.
    await db.update(campaigns).set({ status: 'paused', pausedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.status, 'active'));
    await db.update(creators).set({ status: 'paused', updatedAt: new Date() }).where(eq(creators.status, 'active'));
    await logActivity({ actionType: 'automation_stopped', content: '🛑 STOP ALL AUTOMATION triggered.', status: 'info' });
  } else {
    await db.update(campaigns).set({ status: 'active', pausedAt: null, updatedAt: new Date() }).where(eq(campaigns.status, 'paused'));
    await db.update(creators).set({ status: 'active', updatedAt: new Date() }).where(eq(creators.status, 'paused'));
    await logActivity({ actionType: 'automation_resumed', content: 'Automation resumed globally.', status: 'info' });
  }
}

// ---------- AI / templates for UI ----------
export async function generatePreview(
  creatorId: string,
  channel: 'dm' | 'comment' = 'dm',
  dayNumber?: number,
): Promise<{ message: string; source: 'ai' | 'template'; day: number }> {
  const creator = await db.query.creators.findFirst({ where: eq(creators.id, creatorId) });
  if (!creator) throw new Error('Creator not found');
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.creatorId, creatorId) });
  const day = dayNumber ?? Math.max(1, campaign?.currentDay ?? 1);
  const base = await resolveMessage(channel, day, `Day ${day} asking for a PC 🙏`);
  const settings = await getSettings();

  if (!settings.aiPersonalization) {
    return { message: base, source: 'template', day };
  }
  try {
    const previous = await db
      .select({ content: actionLogs.content })
      .from(actionLogs)
      .where(and(eq(actionLogs.creatorId, creatorId), eq(actionLogs.actionType, 'dm_sent')))
      .orderBy(desc(actionLogs.ts))
      .limit(1);
    const message = await personalizeMessage({
      username: creator.username,
      dayNumber: day,
      channel,
      baseTemplate: base,
      creatorNotes: creator.notes,
      previousInteraction: previous[0]?.content ?? null,
      profileInfo: creator.profileUrl ?? null,
    });
    await logActivity({ creatorId, campaignId: campaign?.id, actionType: 'ai_generated', campaignDay: day, content: message, metadata: { channel, model: settings.aiModel }, status: 'success' });
    return { message, source: 'ai', day };
  } catch (err) {
    await recordSystemError('openrouter', (err as Error).message, { errorClass: 'ai_failure', context: { creatorId } });
    // Fail safe: approved template.
    return { message: base, source: 'template', day };
  }
}

// ---------- Advance state machine ----------
async function advanceCampaign(
  campaignId: string,
  creatorId: string,
  accountId: string | null,
  completedDay: number,
): Promise<void> {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!campaign) return;

  const nextDay = completedDay + 1;
  await db
    .update(campaigns)
    .set({ currentDay: nextDay, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  await db
    .update(creators)
    .set({ currentDay: nextDay, updatedAt: new Date() })
    .where(eq(creators.id, creatorId));

  if (nextDay > campaign.maxDays) {
    await db.update(campaigns).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    await db.update(creators).set({ status: 'completed', updatedAt: new Date() }).where(eq(creators.id, creatorId));
    await logActivity({ creatorId, campaignId, accountId, actionType: 'campaign_completed', campaignDay: completedDay, content: `Campaign completed after ${campaign.maxDays} days. 🎯`, status: 'success' });
    return;
  }

  // Schedule next day at the configured time.
  const when = nextOccurrence(campaign.scheduledTime);
  await scheduleAction({ type: 'dm', creatorId, campaignId, accountId, campaignDay: nextDay, when });
  if (campaign.commentEnabled) {
    await scheduleAction({ type: 'comment', creatorId, campaignId, accountId, campaignDay: nextDay, when: new Date(when.getTime() + 5 * 60_000) });
  }
}

// ---------- Worker: claim + execute due actions ----------
export async function runSchedulerTick(workerId = 'worker'): Promise<{ claimed: number; processed: number }> {
  const settings = await getSettings();
  if (!settings.automationEnabled) {
    await maybeSendDailyReport();
    return { claimed: 0, processed: 0 };
  }

  // Atomic claim: never process the same action twice across workers.
  const rows = await db.execute(sql`
    UPDATE scheduled_actions
    SET status = 'locked', locked_at = now(), locked_by = ${workerId},
        attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM scheduled_actions
      WHERE status = 'pending'
        AND scheduled_at <= now()
        AND (next_retry_at IS NULL OR next_retry_at <= now())
      ORDER BY scheduled_at
      LIMIT 15
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const rawActions = (rows as unknown as { rows: Record<string, any>[] }).rows ?? [];
  // Raw SQL RETURNING yields snake_case keys — normalize to camelCase.
  const actions = rawActions.map((r) => ({
    id: r.id,
    idempotencyKey: r.idempotency_key,
    type: r.type,
    creatorId: r.creator_id,
    campaignId: r.campaign_id,
    accountId: r.account_id,
    campaignDay: r.campaign_day,
    payload: r.payload,
    scheduledAt: r.scheduled_at,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    lastError: r.last_error,
    errorClass: r.error_class,
  }));

  let processed = 0;
  for (const action of actions) {
    try {
      await executeAction(action);
      processed += 1;
    } catch (err) {
      console.error('[scheduler] action crashed:', (err as Error).message);
      await markActionOutcome(action, 'failed', 'scheduler_crash', (err as Error).message);
    }
  }

  await maybeSendDailyReport();
  return { claimed: actions.length, processed };
}

async function executeAction(action: any): Promise<void> {
  const creator = action.creatorId
    ? await db.query.creators.findFirst({ where: eq(creators.id, action.creatorId) })
    : null;
  const campaign = action.campaignId
    ? await db.query.campaigns.findFirst({ where: eq(campaigns.id, action.campaignId) })
    : null;

  // ---- Verification gates (spec: daily DM flow steps 1-4) ----
  if (!creator) return markActionOutcome(action, 'cancelled', 'invalid_creator', 'Creator no longer exists');
  if (creator.excluded) return markActionOutcome(action, 'cancelled', 'invalid_creator', 'Creator excluded');
  if (!campaign || !['active'].includes(campaign.status)) {
    return markActionOutcome(action, 'cancelled', 'permanent_other', `Campaign status is ${campaign?.status ?? 'missing'}`);
  }
  if (creator.responseStatus !== 'none') {
    // Creator replied — STOP automated outreach for this creator.
    return markActionOutcome(action, 'cancelled', 'duplicate', 'Creator replied — automation paused');
  }

  const account = await resolveAccount(action.accountId ?? campaign.accountId ?? creator.accountId);
  if (!account) {
    return markActionOutcome(action, 'failed', 'oauth_expired', 'No connected Instagram account available');
  }

  if (action.type === 'dm') {
    await runDmAction(action, creator, campaign, account);
  } else if (action.type === 'comment') {
    await runCommentAction(action, creator, campaign, account);
  } else if (action.type === 'check_replies') {
    await markActionOutcome(action, 'done');
  } else {
    await markActionOutcome(action, 'done');
  }
}

async function resolveAccount(accountId: string | null) {
  if (!accountId) {
    const [acc] = await db
      .select()
      .from(instagramAccounts)
      .where(eq(instagramAccounts.status, 'connected'))
      .limit(1);
    return acc ?? null;
  }
  return db.query.instagramAccounts.findFirst({ where: eq(instagramAccounts.id, accountId) });
}

async function runDmAction(action: any, creator: any, campaign: any, account: any): Promise<void> {
  const day = action.campaignDay ?? campaign.currentDay;

  // Idempotency: already sent today / for this day?
  const dayRow = await db.query.campaignDays.findFirst({
    where: and(eq(campaignDays.campaignId, campaign.id), eq(campaignDays.dayNumber, day)),
  });
  if (dayRow?.dmSentAt) {
    return markActionOutcome(action, 'done');
  }

  // Step 5: generate or select today's approved DM.
  const base = await resolveMessage('dm', day, dayRow?.dmContent ?? `Day ${day} asking for a PC 🙏`);
  let message = base;
  const settings = await getSettings();
  if (settings.aiPersonalization) {
    try {
      message = await personalizeMessage({
        username: creator.username,
        dayNumber: day,
        channel: 'dm',
        baseTemplate: base,
        creatorNotes: creator.notes,
      });
    } catch (err) {
      await recordSystemError('openrouter', (err as Error).message, { errorClass: 'ai_failure', context: { creatorId: creator.id } });
      message = base; // fail safe with approved template
    }
  }

  // Store the FINAL message in the activity log BEFORE sending.
  await logActivity({
    creatorId: creator.id,
    accountId: account.id,
    campaignId: campaign.id,
    actionType: 'message_prepared',
    campaignDay: day,
    content: message,
    metadata: { channel: 'dm', idempotencyKey: action.idempotencyKey },
    idempotencyKey: action.idempotencyKey,
    status: 'info',
  });

  // Step 6: resolve target + send via the official API only.
  try {
    const token = decrypt(account.accessTokenEnc);
    let recipientIgId = creator.igId;
    if (!recipientIgId) {
      recipientIgId = await resolveCreatorIgId(token, account.igUserId ?? '', creator.username);
      if (recipientIgId) {
        await db.update(creators).set({ igId: recipientIgId, updatedAt: new Date() }).where(eq(creators.id, creator.id));
      }
    }
    if (!account.igUserId) throw new ExternalApiError('permission_denied', 'Connected account has no Instagram user id.');
    if (!recipientIgId) {
      throw new ExternalApiError('invalid_creator', `Could not resolve Instagram user @${creator.username} via the authorized API.`);
    }

    const result = await sendDirectMessage(token, account.igUserId, recipientIgId, message);

    // Step 7: record success.
    await db
      .update(campaignDays)
      .set({ dmSentAt: new Date(), dmContent: message, status: dayRow?.commentSentAt ? 'sent' : 'partial' })
      .where(and(eq(campaignDays.campaignId, campaign.id), eq(campaignDays.dayNumber, day)));
    await db
      .update(creators)
      .set({ lastDmAt: new Date(), lastInteractionAt: new Date(), updatedAt: new Date() })
      .where(eq(creators.id, creator.id));
    await db
      .update(instagramAccounts)
      .set({ lastSuccessAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(instagramAccounts.id, account.id));

    await logActivity({
      creatorId: creator.id,
      accountId: account.id,
      campaignId: campaign.id,
      actionType: 'dm_sent',
      campaignDay: day,
      content: message,
      metadata: { apiResponse: result.raw, externalId: result.externalId },
      idempotencyKey: action.idempotencyKey,
      status: 'success',
    });

    await markActionOutcome(action, 'done');

    // Queue same-day comment action if enabled.
    if (campaign.commentEnabled && !(await commentExistsForDay(campaign.id, day))) {
      await scheduleAction({
        type: 'comment',
        creatorId: creator.id,
        campaignId: campaign.id,
        accountId: account.id,
        campaignDay: day,
        when: new Date(Date.now() + 2 * 60_000),
      });
    }

    // Step 8: advance.
    await advanceCampaign(campaign.id, creator.id, account.id, day);
  } catch (err) {
    await handleSendError(err, action, creator, campaign, account, 'dm', day);
  }
}

async function commentExistsForDay(campaignId: string, day: number): Promise<boolean> {
  const [row] = await db
    .select({ id: campaignDays.id })
    .from(campaignDays)
    .where(and(eq(campaignDays.campaignId, campaignId), eq(campaignDays.dayNumber, day), isNotNull(campaignDays.commentSentAt)))
    .limit(1);
  return !!row;
}

async function runCommentAction(action: any, creator: any, campaign: any, account: any): Promise<void> {
  const day = action.campaignDay ?? campaign.currentDay;
  const dayRow = await db.query.campaignDays.findFirst({
    where: and(eq(campaignDays.campaignId, campaign.id), eq(campaignDays.dayNumber, day)),
  });
  if (dayRow?.commentSentAt) {
    return markActionOutcome(action, 'done');
  }

  const base = await resolveMessage('comment', day, dayRow?.commentContent ?? `Day ${day} asking for a PC 😭`);
  let message = base;
  const settings = await getSettings();
  if (settings.aiPersonalization) {
    try {
      message = await personalizeMessage({ username: creator.username, dayNumber: day, channel: 'comment', baseTemplate: base, creatorNotes: creator.notes });
    } catch (err) {
      await recordSystemError('openrouter', (err as Error).message, { errorClass: 'ai_failure' });
      message = base;
    }
  }

  await logActivity({
    creatorId: creator.id,
    accountId: account.id,
    campaignId: campaign.id,
    actionType: 'message_prepared',
    campaignDay: day,
    content: message,
    metadata: { channel: 'comment', idempotencyKey: action.idempotencyKey },
    idempotencyKey: action.idempotencyKey,
    status: 'info',
  });

  try {
    const token = decrypt(account.accessTokenEnc);
    if (!account.igUserId) throw new ExternalApiError('permission_denied', 'Connected account has no Instagram user id.');

    // Select the configured post/reel: most recent eligible media for this creator.
    const media = await getCreatorMedia(token, account.igUserId, creator.username);
    const target = media[0];

    if (!target) {
      // Nothing commentable found through the authorized API — manual action required.
      await logActivity({
        creatorId: creator.id,
        accountId: account.id,
        campaignId: campaign.id,
        actionType: 'manual_action_required',
        campaignDay: day,
        content: 'API permission unavailable — manual action required.',
        metadata: { reason: 'no_eligible_media', channel: 'comment' },
        status: 'info',
      });
      return markActionOutcome(action, 'done');
    }

    // Never comment on the same content twice.
    const dup = await db
      .select({ id: actionLogs.id })
      .from(actionLogs)
      .where(
        and(
          eq(actionLogs.actionType, 'comment_posted'),
          eq(actionLogs.creatorId, creator.id),
          sql`metadata->>'mediaId' = ${target.id}`,
        ),
      )
      .limit(1);
    if (dup.length > 0) {
      return markActionOutcome(action, 'done');
    }

    const result = await postComment(token, target.id, message);

    await db
      .update(campaignDays)
      .set({ commentSentAt: new Date(), commentContent: message, status: dayRow?.dmSentAt ? 'sent' : 'partial' })
      .where(and(eq(campaignDays.campaignId, campaign.id), eq(campaignDays.dayNumber, day)));
    await db
      .update(creators)
      .set({ lastCommentAt: new Date(), lastInteractionAt: new Date(), updatedAt: new Date() })
      .where(eq(creators.id, creator.id));
    await db
      .update(instagramAccounts)
      .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
      .where(eq(instagramAccounts.id, account.id));

    await logActivity({
      creatorId: creator.id,
      accountId: account.id,
      campaignId: campaign.id,
      actionType: 'comment_posted',
      campaignDay: day,
      content: message,
      metadata: { apiResponse: result.raw, externalId: result.externalId, mediaId: target.id, mediaUrl: target.permalink, mediaType: target.mediaType },
      idempotencyKey: action.idempotencyKey,
      status: 'success',
    });
    await markActionOutcome(action, 'done');
  } catch (err) {
    if (err instanceof ExternalApiError && (err.errorClass === 'permission_denied' || err.errorClass === 'oauth_expired')) {
      // The authorized API cannot perform this comment. Never bypass.
      await logActivity({
        creatorId: creator.id,
        accountId: account.id,
        campaignId: campaign.id,
        actionType: 'manual_action_required',
        campaignDay: day,
        content: 'API permission unavailable — manual action required.',
        metadata: { reason: err.errorClass, detail: err.message },
        status: 'info',
      });
      await markActionOutcome(action, 'done');
      await recordSystemError('instagram', `Comment not permitted by API: ${err.message}`, {
        errorClass: err.errorClass,
        context: { creator: creator.username, day },
      });
      if (err.errorClass === 'oauth_expired') {
        await db.update(instagramAccounts).set({ status: 'expired', errorCount: sql`${instagramAccounts.errorCount} + 1`, lastError: err.message, updatedAt: new Date() }).where(eq(instagramAccounts.id, account.id));
      }
      return;
    }
    await handleSendError(err, action, creator, campaign, account, 'comment', day);
  }
}

async function handleSendError(
  err: unknown,
  action: any,
  creator: any,
  campaign: any,
  account: any,
  channel: 'dm' | 'comment',
  day: number,
): Promise<void> {
  const cls: ErrorClass = err instanceof ExternalApiError ? err.errorClass : 'transient_network';
  const message = err instanceof Error ? err.message : 'Unknown error';

  await logActivity({
    creatorId: creator.id,
    accountId: account.id,
    campaignId: campaign.id,
    actionType: channel === 'dm' ? 'dm_sent' : 'comment_posted',
    campaignDay: day,
    status: 'failed',
    errorMessage: message,
    metadata: { errorClass: cls },
    idempotencyKey: action.idempotencyKey,
  });

  await db
    .update(instagramAccounts)
    .set({ errorCount: sql`${instagramAccounts.errorCount} + 1`, lastError: message.slice(0, 500), updatedAt: new Date(), ...(cls === 'oauth_expired' ? { status: 'expired' } : {}) })
    .where(eq(instagramAccounts.id, account.id));

  if (cls === 'blocked') {
    await db.update(creators).set({ responseStatus: 'blocked', status: 'blocked', updatedAt: new Date() }).where(eq(creators.id, creator.id));
    await db.update(campaigns).set({ status: 'blocked', updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
    await markActionOutcome(action, 'cancelled', cls, message);
    return;
  }
  if (cls === 'invalid_creator') {
    await db.update(creators).set({ status: 'error', updatedAt: new Date() }).where(eq(creators.id, creator.id));
    await markActionOutcome(action, 'failed', cls, message);
    await recordSystemError('instagram', message, { errorClass: cls, context: { creator: creator.username } });
    return;
  }

  if (PERMANENT_ERROR_CLASSES.includes(cls)) {
    await markActionOutcome(action, 'failed', cls, message);
    await recordSystemError('instagram', message, { errorClass: cls, context: { creator: creator.username, channel, day } });
    return;
  }

  // Transient: exponential backoff (60s, 120s, 240s... capped 30 min).
  const attempts = action.attempts ?? 1;
  if (attempts >= action.maxAttempts) {
    await markActionOutcome(action, 'failed', cls, `${message} (max retries exhausted)`);
    await recordSystemError('instagram', `${message} (max retries)`, { errorClass: cls, context: { creator: creator.username, channel, day, attempts } });
    return;
  }
  const backoff = Math.min(60_000 * 2 ** (attempts - 1), 30 * 60_000);
  await db
    .update(scheduledActions)
    .set({
      status: 'pending',
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 500),
      errorClass: cls,
      nextRetryAt: new Date(Date.now() + backoff),
      updatedAt: new Date(),
    })
    .where(eq(scheduledActions.id, action.id));
  await recordSystemError('instagram', `${message} — retry in ${Math.round(backoff / 1000)}s`, {
    errorClass: cls,
    context: { creator: creator.username, channel, day, attempts },
  });
}

async function markActionOutcome(action: any, status: 'done' | 'failed' | 'cancelled', errorClass?: string, errorMessage?: string): Promise<void> {
  await db
    .update(scheduledActions)
    .set({
      status: status === 'done' ? 'done' : status,
      lockedAt: null,
      lockedBy: null,
      lastError: errorMessage ?? null,
      errorClass: errorClass ?? null,
      ...(status === 'done' ? { nextRetryAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scheduledActions.id, action.id));
}

// ---------- Daily report ----------
async function maybeSendDailyReport(): Promise<void> {
  const [tg] = await db.select().from(telegramSettings).where(eq(telegramSettings.id, 1)).limit(1);
  if (!tg || tg.dailyReportEnabled === false) return;
  const now = new Date();
  const [h, m] = (tg.reportTime ?? '09:00').split(':').map(Number);
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  if (now < due) return;

  const today = now.toISOString().slice(0, 10);
  if (tg.lastReportAt && tg.lastReportAt.toISOString().slice(0, 10) === today) return;

  const { message, stats } = await buildDailyReport();
  const sent = await sendTelegramIfEnabled(message, { reportOnly: true });
  await db.insert(dailyReports).values({ reportDate: today, stats, message, sent, sentAt: sent ? new Date() : null }).onConflictDoNothing();
  await db.update(telegramSettings).set({ lastReportAt: new Date(), updatedAt: new Date() }).where(eq(telegramSettings.id, 1));
  await logActivity({ actionType: 'report_sent', content: sent ? 'Daily report delivered to Telegram.' : 'Daily report generated (Telegram not configured).', status: sent ? 'success' : 'info' });
}

export async function sendManualReport(): Promise<{ sent: boolean; message: string }> {
  const { message } = await buildDailyReport();
  const chatId = await resolveChatId();
  const sent = chatId ? await sendTelegramIfEnabled(message) : false;
  return { sent, message };
}

export async function sendTestTelegram(message: string): Promise<boolean> {
  const sent = await sendTelegramIfEnabled(message);
  await logActivity({ actionType: 'test_sent', content: message, status: sent ? 'success' : 'failed', errorMessage: sent ? null : 'Telegram not configured or delivery failed.' });
  return sent;
}

// ---------- Polling for comment replies (best effort) ----------
export async function pollCommentReplies(): Promise<void> {
  // DM replies arrive via webhook (the Messaging API does not support
  // reading inbox messages via polling). Comments can be polled when
  // instagram_manage_comments is authorized.
  const accounts = await db.select().from(instagramAccounts).where(eq(instagramAccounts.status, 'connected'));
  for (const account of accounts) {
    try {
      const token = decrypt(account.accessTokenEnc);
      if (!account.igUserId) continue;
      const activeCreators = await db
        .select()
        .from(creators)
        .where(and(eq(creators.accountId, account.id), or(eq(creators.status, 'active'), eq(creators.status, 'waiting'))));
      for (const creator of activeCreators) {
        const media = await getCreatorMedia(token, account.igUserId, creator.username).catch(() => []);
        for (const m of media.slice(0, 3)) {
          const comments = await getCreatorMediaComments(token, m.id).catch(() => []);
          for (const c of comments) {
            if (c.fromUsername.toLowerCase() === account.username?.toLowerCase()) continue;
            if (c.fromUsername.toLowerCase() === creator.username.toLowerCase() || true) {
              await handleInboundReply({
                creatorId: creator.id,
                platform: 'comment',
                text: c.text,
                externalId: c.id,
                mediaRef: m.permalink,
                accountId: account.id,
                raw: c,
              }).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      console.error('[poll] comment poll failed:', (err as Error).message);
    }
  }
}

async function getCreatorMediaComments(token: string, mediaId: string) {
  const { getMediaComments } = await import('./instagram.js');
  return getMediaComments(token, mediaId);
}


