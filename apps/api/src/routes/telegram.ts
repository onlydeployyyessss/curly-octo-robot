import { Router } from 'express';
import { db } from '../db/client.js';
import { telegramSettings, dailyReports } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { telegramSettingsSchema } from '@pc/shared';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { setWebhook, deleteWebhook } from '../services/telegram.js';
import { sendManualReport, sendTestTelegram } from '../services/campaign-engine.js';
import { TELEGRAM_COMMANDS } from '@pc/shared';

export const telegramRouter = Router();
telegramRouter.use(requireAuth);

telegramRouter.get(
  '/settings',
  wrap(async (_req, res) => {
    const [row] = await db.select().from(telegramSettings).where(eq(telegramSettings.id, 1)).limit(1);
    res.json({
      settings: {
        chatId: row?.chatId ?? env.telegramChatId ?? null,
        reportTime: row?.reportTime ?? '09:00',
        dailyReportEnabled: row?.dailyReportEnabled ?? true,
        instantAlertsEnabled: row?.instantAlertsEnabled ?? true,
        authorizedIds: row?.authorizedIds ?? env.telegramAuthorizedIds,
        lastReportAt: row?.lastReportAt ? row.lastReportAt.toISOString() : null,
        botConfigured: !!env.telegramBotToken,
      },
      commands: TELEGRAM_COMMANDS,
    });
  }),
);

telegramRouter.put(
  '/settings',
  validateBody(telegramSettingsSchema),
  wrap(async (req, res) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.chatId !== undefined) patch.chatId = req.body.chatId || null;
    if (req.body.reportTime) patch.reportTime = req.body.reportTime;
    if (req.body.dailyReportEnabled !== undefined) patch.dailyReportEnabled = req.body.dailyReportEnabled;
    if (req.body.instantAlertsEnabled !== undefined) patch.instantAlertsEnabled = req.body.instantAlertsEnabled;
    if (req.body.authorizedIds) patch.authorizedIds = req.body.authorizedIds;

    await db
      .insert(telegramSettings)
      .values({ id: 1, ...patch } as any)
      .onConflictDoUpdate({ target: telegramSettings.id, set: patch });
    await audit(req, 'telegram_settings_updated', 'settings', undefined, patch);
    res.json({ ok: true });
  }),
);

telegramRouter.post(
  '/test',
  wrap(async (_req, res) => {
    const sent = await sendTestTelegram('🧪 <b>PC MISSION</b>\n\nTelegram connection works. You will receive daily reports and instant reply alerts here.');
    res.json({ ok: sent });
    if (!sent) res.status(502);
  }),
);

telegramRouter.post(
  '/report-now',
  wrap(async (_req, res) => {
    const result = await sendManualReport();
    res.json(result);
  }),
);

telegramRouter.post(
  '/webhook',
  wrap(async (req, res) => {
    const url = String(req.body.url ?? '');
    if (url) await setWebhook(url);
    else await deleteWebhook();
    await db
      .insert(telegramSettings)
      .values({ id: 1, webhookUrl: url || null, updatedAt: new Date() })
      .onConflictDoUpdate({ target: telegramSettings.id, set: { webhookUrl: url || null, updatedAt: new Date() } });
    res.json({ ok: true });
  }),
);

telegramRouter.get(
  '/reports',
  wrap(async (_req, res) => {
    const rows = await db
      .select()
      .from(dailyReports)
      .orderBy(desc(dailyReports.reportDate))
      .limit(30);
    res.json({
      reports: rows.map((r) => ({
        id: r.id,
        date: r.reportDate,
        sent: r.sent,
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      })),
    });
  }),
);
