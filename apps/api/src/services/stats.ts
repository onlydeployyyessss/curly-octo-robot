// ============================================================
// Dashboard analytics — all metrics computed from the activity
// log and campaign tables (single source of truth).
// ============================================================
import { db } from '../db/client.js';
import {
  actionLogs,
  campaigns,
  creators,
  dailyReports,
  replies,
  systemErrors,
} from '../db/schema.js';
import { desc, eq, gte, and, sql, isNotNull } from 'drizzle-orm';
import { getSettings } from '../lib/settings.js';
import type { DashboardStats } from '@pc/shared';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = startOfToday();
  const settings = await getSettings();

  const [totalCreators] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(creators);

  const [activeCampaigns] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(eq(campaigns.status, 'active'));

  const [completedCampaigns] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(eq(campaigns.status, 'completed'));

  const [dmsSent] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(actionLogs)
    .where(eq(actionLogs.actionType, 'dm_sent'));

  const [commentsSent] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(actionLogs)
    .where(eq(actionLogs.actionType, 'comment_posted'));

  const [creatorReplies] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(replies);

  const [positiveReplies] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(replies)
    .where(eq(replies.sentiment, 'positive'));

  const [declines] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(creators)
    .where(eq(creators.responseStatus, 'declined'));

  const [errors] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(systemErrors)
    .where(eq(systemErrors.resolved, false));

  // Today's counters
  const todayCounts = async (type: string) => {
    const [r] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(actionLogs)
      .where(and(eq(actionLogs.actionType, type), gte(actionLogs.ts, today)));
    return r?.c ?? 0;
  };

  const [todayErrorsR, todayNewR] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(systemErrors)
      .where(and(eq(systemErrors.resolved, false), gte(systemErrors.ts, today))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(creators)
      .where(gte(creators.createdAt, today)),
  ]);

  const statusBreakdown = await db
    .select({ status: campaigns.status, c: sql<number>`count(*)::int` })
    .from(campaigns)
    .groupBy(campaigns.status);

  const daysActive = await db
    .select({ day: campaigns.currentDay, c: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'active'), gte(campaigns.currentDay, 1)))
    .groupBy(campaigns.currentDay)
    .orderBy(campaigns.currentDay);

  return {
    totalCreators: totalCreators?.c ?? 0,
    activeCampaigns: activeCampaigns?.c ?? 0,
    completedCampaigns: completedCampaigns?.c ?? 0,
    dmsSent: dmsSent?.c ?? 0,
    commentsSent: commentsSent?.c ?? 0,
    creatorReplies: creatorReplies?.c ?? 0,
    positiveReplies: positiveReplies?.c ?? 0,
    declines: declines?.c ?? 0,
    errors: errors?.c ?? 0,
    currentCampaigns: statusBreakdown.map((r) => ({ status: r.status, count: r.c })),
    daysActive: daysActive.map((r) => ({ day: r.day, count: r.c })),
    today: {
      dms: await todayCounts('dm_sent'),
      comments: await todayCounts('comment_posted'),
      replies: await todayCounts('dm_received') + (await todayCounts('comment_received')),
      errors: todayErrorsR[0]?.c ?? 0,
      newCreators: todayNewR[0]?.c ?? 0,
    },
    pcReceived: settings.pcReceived,
    positiveOpportunities: positiveReplies?.c ?? 0,
    automationEnabled: settings.automationEnabled,
  };
}

export async function getLatestErrors(limit = 10) {
  return db
    .select()
    .from(systemErrors)
    .orderBy(desc(systemErrors.ts))
    .limit(limit)
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        ts: r.ts.toISOString(),
        service: r.service,
        errorClass: r.errorClass,
        message: r.message,
        resolved: r.resolved,
      })),
    );
}

export async function lastReportDate(): Promise<string | null> {
  const [r] = await db
    .select({ date: dailyReports.reportDate })
    .from(dailyReports)
    .where(eq(dailyReports.sent, true))
    .orderBy(desc(dailyReports.reportDate))
    .limit(1);
  return r?.date ?? null;
}

export { isNotNull };
