// ============================================================
// Telegram message formatting: daily report + instant reply
// alerts. Layout mirrors the spec exactly.
// ============================================================
import { db } from '../db/client.js';
import { creators, replies, instagramAccounts, actionLogs } from '../db/schema.js';
import { desc, eq, gte, and, sql } from 'drizzle-orm';
import { getDashboardStats } from './stats.js';
import type { ReplyDTO } from '@pc/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function hotReplies(limit = 5): Promise<ReplyDTO[]> {
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
  return rows.map(
    (r): ReplyDTO => ({
      id: r.id,
      creatorId: r.creatorId,
      creatorUsername: r.creatorUsername ?? 'unknown',
      accountUsername: r.accountUsername ?? null,
      platform: r.platform as 'dm' | 'comment',
      text: r.text,
      ourText: r.ourText ?? null,
      mediaRef: r.mediaRef ?? null,
      sentiment: (r.sentiment as ReplyDTO['sentiment']) ?? 'replied',
      ts: r.ts.toISOString(),
      notified: r.notified,
    }),
  );
}

export async function buildDailyReport(): Promise<{ message: string; stats: Record<string, unknown> }> {
  const s = await getDashboardStats();
  const today = startOfToday();

  const [maybeCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(replies)
    .where(eq(replies.sentiment, 'maybe'));
  const [declinedCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(replies)
    .where(eq(replies.sentiment, 'declined'));

  const [newCreators] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(creators)
    .where(gte(creators.createdAt, today));

  const [completedToday] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(actionLogs)
    .where(and(eq(actionLogs.actionType, 'campaign_completed'), gte(actionLogs.ts, today)));

  const [failedToday] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(actionLogs)
    .where(and(eq(actionLogs.status, 'failed'), gte(actionLogs.ts, today)));

  const hot = await hotReplies(5);

  const lines: string[] = [];
  lines.push('🤖 <b>PC MISSION — DAILY REPORT</b>');
  lines.push(`📅 ${fmtDate(new Date())}`);
  lines.push('');
  lines.push('👥 <b>CREATORS</b>');
  lines.push(`• Active: ${s.activeCampaigns}`);
  lines.push(`• New: ${newCreators?.c ?? s.today.newCreators}`);
  lines.push(`• Completed: ${completedToday?.c ?? 0}`);
  lines.push('');
  lines.push('📨 <b>OUTREACH</b>');
  lines.push(`• DMs sent: ${s.today.dms}`);
  lines.push(`• Comments sent: ${s.today.comments}`);
  lines.push(`• Failed actions: ${failedToday?.c ?? s.today.errors}`);
  lines.push('');
  lines.push('💬 <b>RESPONSES</b>');
  lines.push(`• Total replies: ${s.creatorReplies}`);
  lines.push(`• Positive replies: ${s.positiveReplies}`);
  lines.push(`• Maybe: ${maybeCount?.c ?? 0}`);
  lines.push(`• Declined: ${declinedCount?.c ?? s.declines}`);

  if (hot.length > 0) {
    lines.push('');
    lines.push('🔥 <b>CREATOR REPLIES</b>');
    for (const r of hot) {
      lines.push('');
      lines.push(`@${r.creatorUsername}`);
      if (r.platform === 'comment') {
        lines.push('💬 Comment reply:');
      } else {
        lines.push('📩 DM reply:');
      }
      lines.push(`"${escapeHtml(r.text.slice(0, 300))}"`);
    }
  }

  lines.push('');
  lines.push('⏳ <b>ACTIVE CAMPAIGNS</b>');
  if (s.daysActive.length === 0) {
    lines.push('• None right now');
  } else {
    for (const d of s.daysActive) {
      lines.push(`• Day ${d.day}${d.day >= 5 ? '+' : ''}: ${d.count}`);
    }
  }

  lines.push('');
  lines.push('🎯 <b>PC MISSION</b>');
  lines.push(`PC received: ${s.pcReceived ? '✅' : '❌'}`);
  lines.push(`Positive opportunities: ${s.positiveOpportunities}`);

  const totalErrors = failedToday?.c ?? 0;
  if (totalErrors > 0) {
    lines.push('');
    lines.push('⚠️ <b>ERRORS</b>');
    lines.push(`• ${totalErrors} action${totalErrors === 1 ? '' : 's'} failed`);
  }

  const message = lines.join('\n');
  return { message, stats: { ...s } as unknown as Record<string, unknown> };
}

export async function buildReplyAlert(reply: {
  creatorUsername: string;
  platform: 'dm' | 'comment';
  text: string;
  ourText?: string | null;
  mediaRef?: string | null;
  campaignDay?: number | null;
  accountUsername?: string | null;
}): Promise<string> {
  const lines: string[] = [];
  if (reply.platform === 'dm') {
    lines.push('🔥 <b>CREATOR REPLIED</b>');
  } else {
    lines.push('🔥 <b>COMMENT REPLY</b>');
  }
  lines.push('');
  lines.push(`👤 @${reply.creatorUsername}`);
  if (reply.platform === 'comment' && reply.mediaRef) {
    lines.push('');
    lines.push(`📍 Reel/post: ${escapeHtml(reply.mediaRef)}`);
  }
  if (reply.ourText) {
    lines.push('');
    lines.push('💬 Your comment:');
    lines.push(`"${escapeHtml(reply.ourText)}"`);
  }
  lines.push('');
  lines.push(reply.platform === 'dm' ? '📩 DM:' : '💬 Creator:');
  lines.push(`"${escapeHtml(reply.text.slice(0, 500))}"`);
  lines.push('');
  lines.push('🛑 Automation automatically paused.');
  if (reply.campaignDay) {
    lines.push(`Campaign: Day ${reply.campaignDay}`);
  }
  if (reply.accountUsername) {
    lines.push(`Account: @${reply.accountUsername}`);
  }
  return lines.join('\n');
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
