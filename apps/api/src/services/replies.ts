// ============================================================
// Creator response detection & processing.
// When a creator replies we STOP all automated outreach for that
// creator, surface the reply in the dashboard, and push an instant
// Telegram alert.
// ============================================================
import { db } from '../db/client.js';
import {
  actionLogs,
  campaigns,
  conversations,
  creators,
  instagramAccounts,
  replies,
  scheduledActions,
} from '../db/schema.js';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { logActivity } from './campaign-engine.js';
import { sendTelegramIfEnabled } from './telegram-helper.js';
import { buildReplyAlert } from './reports.js';
import type { ReplyDTO, ResponseStatus } from '@pc/shared';

const POSITIVE = [
  'sure',
  'yes',
  'yeah',
  'yep',
  'okay',
  'ok!',
  'send',
  'dm me',
  'details',
  'requirements',
  'specs',
  'i can',
  "i'll",
  'lets do',
  "let's do",
  'hit me up',
  'what do you need',
  'which pc',
  'send me',
  'my email',
  'no problem',
  'for sure',
  'definitely',
  'got you',
  'i got you',
];
const MAYBE = ['maybe', 'might', 'see what i can', 'not sure', 'possibly', 'try', 'later', 'busy', 'next week', 'giveaway'];
const DECLINE = ['no', 'nope', "can't", 'cant', 'stop', 'unfollow', 'not interested', 'dont ask', "don't ask", 'weird', 'creep', 'block', 'never', 'sorry no', 'impossible'];

export function classifySentiment(text: string): ResponseStatus {
  const t = text.toLowerCase();
  if (/blocked|unfollow|stop (dm|messaging|asking)/i.test(t)) return 'blocked';
  if (DECLINE.some((w) => t.includes(w))) return 'declined';
  if (POSITIVE.some((w) => t.includes(w))) return 'positive';
  if (MAYBE.some((w) => t.includes(w))) return 'maybe';
  return 'replied';
}

export async function getRecentReplies(limit = 20): Promise<ReplyDTO[]> {
  const rows = await db
    .select({
      id: replies.id,
      creatorId: replies.creatorId,
      creatorUsername: creators.username,
      accountUsername: instagramAccounts.username,
      platform: replies.platform,
      text: replies.text,
      ourText: replies.ourText,
      mediaRef: replies.mediaRef,
      sentiment: replies.sentiment,
      ts: replies.ts,
      notified: replies.notified,
    })
    .from(replies)
    .leftJoin(creators, eq(replies.creatorId, creators.id))
    .leftJoin(instagramAccounts, eq(replies.accountId, instagramAccounts.id))
    .orderBy(desc(replies.ts))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    creatorId: r.creatorId,
    creatorUsername: r.creatorUsername ?? 'unknown',
    accountUsername: r.accountUsername,
    platform: r.platform as 'dm' | 'comment',
    text: r.text,
    ourText: r.ourText,
    mediaRef: r.mediaRef,
    sentiment: (r.sentiment as ResponseStatus) ?? 'replied',
    ts: r.ts.toISOString(),
    notified: r.notified,
  }));
}

export interface InboundReplyInput {
  creatorId: string;
  platform: 'dm' | 'comment';
  text: string;
  externalId?: string;
  ourText?: string | null;
  mediaRef?: string | null;
  accountId?: string | null;
  raw?: Record<string, unknown>;
}

/** Process an inbound creator reply (from webhook, polling, or manual entry). */
export async function handleInboundReply(input: InboundReplyInput): Promise<ReplyDTO> {
  const creator = await db.query.creators.findFirst({ where: eq(creators.id, input.creatorId) });
  if (!creator) throw new Error('Creator not found');

  // Idempotency: never process the same external message twice.
  if (input.externalId) {
    const existing = await db.query.replies.findFirst({
      where: and(eq(replies.externalId, input.externalId), eq(replies.creatorId, input.creatorId)),
    });
    if (existing) {
      return {
        id: existing.id,
        creatorId: existing.creatorId,
        creatorUsername: creator.username,
        accountUsername: null,
        platform: existing.platform as 'dm' | 'comment',
        text: existing.text,
        ourText: existing.ourText,
        mediaRef: existing.mediaRef,
        sentiment: (existing.sentiment as ResponseStatus) ?? 'replied',
        ts: existing.ts instanceof Date ? existing.ts.toISOString() : String(existing.ts),
        notified: existing.notified,
      };
    }
  }

  const sentiment = classifySentiment(input.text);
  const threadId = input.externalId ?? `${input.platform}-${Date.now()}`;

  const [conv] = await db
    .insert(conversations)
    .values({
      creatorId: input.creatorId,
      accountId: input.accountId ?? creator.accountId,
      platform: input.platform,
      threadExternalId: threadId,
    })
    .onConflictDoNothing()
    .returning();

  let conversationId: string | null = conv?.id ?? null;
  if (!conversationId) {
    const found = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.creatorId, input.creatorId),
        eq(conversations.platform, input.platform),
        eq(conversations.threadExternalId, threadId),
      ),
    });
    conversationId = found?.id ?? null;
  }

  const reply = await db
    .insert(replies)
    .values({
      creatorId: input.creatorId,
      accountId: input.accountId ?? creator.accountId,
      conversationId,
      platform: input.platform,
      externalId: input.externalId ?? null,
      text: input.text,
      ourText: input.ourText ?? null,
      mediaRef: input.mediaRef ?? null,
      sentiment,
      raw: input.raw ?? null,
    })
    .returning()
    .then((rows) => rows[0]!);

  // Update creator + campaign state
  const newStatus: ResponseStatus = sentiment;
  const campaignStatus =
    sentiment === 'positive' ? 'positive' : sentiment === 'declined' ? 'declined' : sentiment === 'blocked' ? 'blocked' : 'replied';

  await db
    .update(creators)
    .set({
      responseStatus: newStatus,
      status: campaignStatus,
      lastInteractionAt: new Date(),
      lastResponseAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creators.id, input.creatorId));

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.creatorId, input.creatorId),
  });
  if (campaign && ['active', 'waiting', 'paused'].includes(campaign.status)) {
    await db
      .update(campaigns)
      .set({ status: 'paused', pausedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));
  }

  // Cancel any future scheduled outreach for this creator.
  await db
    .update(scheduledActions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(scheduledActions.creatorId, input.creatorId),
        inArray(scheduledActions.status, ['pending', 'locked', 'failed']),
      ),
    );

  await logActivity({
    creatorId: input.creatorId,
    accountId: input.accountId ?? creator.accountId,
    campaignId: campaign?.id ?? null,
    actionType: input.platform === 'dm' ? 'dm_received' : 'comment_received',
    content: input.text,
    status: 'success',
    metadata: { sentiment, externalId: input.externalId ?? null },
  });
  await logActivity({
    creatorId: input.creatorId,
    campaignId: campaign?.id ?? null,
    actionType: 'campaign_paused',
    content: 'Creator replied — automation paused.',
    status: 'info',
  });

  // Instant Telegram alert
  try {
    const alert = await buildReplyAlert({
      creatorUsername: creator.username,
      platform: input.platform,
      text: input.text,
      ourText: input.ourText ?? null,
      mediaRef: input.mediaRef ?? null,
      campaignDay: campaign?.currentDay ?? null,
      accountUsername: null,
    });
    await sendTelegramIfEnabled(alert, { instantOnly: true });
    await db.update(replies).set({ notified: true }).where(eq(replies.id, reply.id));
  } catch (err) {
    console.error('[replies] telegram alert failed:', (err as Error).message);
  }

  return {
    id: reply.id,
    creatorId: reply.creatorId,
    creatorUsername: creator.username,
    accountUsername: null,
    platform: reply.platform as 'dm' | 'comment',
    text: reply.text,
    ourText: reply.ourText,
    mediaRef: reply.mediaRef,
    sentiment: (reply.sentiment as ResponseStatus) ?? 'replied',
    ts: reply.ts instanceof Date ? reply.ts.toISOString() : String(reply.ts),
    notified: reply.notified,
  };
}
