import { Router } from 'express';
import { db } from '../db/client.js';
import { messageTemplates, creators } from '../db/schema.js';
import { asc, eq } from 'drizzle-orm';
import { wrap, HttpError } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import {
  templateSchema,
  bulkTemplatesSchema,
  generateMessageSchema,
  sendTestSchema,
} from '@pc/shared';
import { requireAuth } from '../middleware/auth.js';
import { generatePreview, sendTestTelegram, logActivity } from '../services/campaign-engine.js';
import { audit } from '../lib/audit.js';
import { env } from '../env.js';

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

templatesRouter.get(
  '/',
  wrap(async (_req, res) => {
    const rows = await db
      .select()
      .from(messageTemplates)
      .orderBy(asc(messageTemplates.channel), asc(messageTemplates.dayNumber));
    res.json({
      templates: rows.map((r) => ({
        id: r.id,
        name: r.name,
        channel: r.channel,
        dayNumber: r.dayNumber,
        content: r.content,
        aiEnabled: r.aiEnabled,
        approved: r.approved,
      })),
    });
  }),
);

templatesRouter.post(
  '/',
  validateBody(templateSchema),
  wrap(async (req, res) => {
    const [t] = await db
      .insert(messageTemplates)
      .values({
        name: req.body.name,
        channel: req.body.channel,
        dayNumber: req.body.dayNumber ?? null,
        content: req.body.content,
        aiEnabled: req.body.aiEnabled ?? false,
        approved: req.body.approved ?? true,
      })
      .returning();
    await audit(req, 'template_created', 'template', t.id);
    res.status(201).json({ id: t.id });
  }),
);

templatesRouter.put(
  '/bulk',
  validateBody(bulkTemplatesSchema),
  wrap(async (req, res) => {
    for (const t of req.body.templates) {
      const rows = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.channel, t.channel));
      const match = rows.find((r) => r.dayNumber === t.dayNumber);
      if (match) {
        await db
          .update(messageTemplates)
          .set({ content: t.content, updatedAt: new Date(), approved: true })
          .where(eq(messageTemplates.id, match.id));
      } else {
        await db.insert(messageTemplates).values({
          name: `Day ${t.dayNumber} ${t.channel}`,
          channel: t.channel,
          dayNumber: t.dayNumber,
          content: t.content,
          approved: true,
        });
      }
    }
    await audit(req, 'templates_bulk_updated');
    res.json({ ok: true });
  }),
);

templatesRouter.patch(
  '/:id',
  wrap(async (req, res) => {
    const [t] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, req.params.id)).limit(1);
    if (!t) throw new HttpError(404, 'Template not found');
    await db
      .update(messageTemplates)
      .set({
        content: req.body.content ?? t.content,
        approved: req.body.approved ?? t.approved,
        aiEnabled: req.body.aiEnabled ?? t.aiEnabled,
        updatedAt: new Date(),
      })
      .where(eq(messageTemplates.id, t.id));
    res.json({ ok: true });
  }),
);

templatesRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    await db.delete(messageTemplates).where(eq(messageTemplates.id, req.params.id));
    await audit(req, 'template_deleted', 'template', req.params.id);
    res.json({ ok: true });
  }),
);

// AI / template preview for a specific creator + day
templatesRouter.post(
  '/generate',
  validateBody(generateMessageSchema),
  wrap(async (req, res) => {
    const result = await generatePreview(
      req.body.creatorId,
      req.body.channel ?? 'dm',
      req.body.dayNumber,
    );
    res.json(result);
  }),
);

// Send test: to Telegram, or logged only for Instagram (never auto-DMs a real creator)
templatesRouter.post(
  '/send-test',
  validateBody(sendTestSchema),
  wrap(async (req, res) => {
    const { message, toTelegram } = req.body;
    if (toTelegram) {
      if (!env.telegramBotToken) throw new HttpError(400, 'Telegram bot is not configured.');
      const sent = await sendTestTelegram(`🧪 <b>PC MISSION TEST</b>\n\n${message}`);
      if (!sent) throw new HttpError(502, 'Telegram delivery failed — check bot token and chat id.');
      return res.json({ ok: true, delivered: 'telegram' });
    }
    // Instagram "test" is logged, not sent to a real creator — prevents spam.
    await logActivity({
      actionType: 'test_sent',
      content: message,
      status: 'success',
      metadata: { note: 'Test message logged — not sent to any real creator.' },
    });
    res.json({ ok: true, delivered: 'logged' });
  }),
);

templatesRouter.get(
  '/creators-for-generate',
  wrap(async (_req, res) => {
    const rows = await db
      .select({ id: creators.id, username: creators.username, currentDay: creators.currentDay })
      .from(creators)
      .limit(500);
    res.json({ creators: rows });
  }),
);
