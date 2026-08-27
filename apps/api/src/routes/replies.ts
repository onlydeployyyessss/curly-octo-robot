import { Router } from 'express';
import { db } from '../db/client.js';
import { replies, creators } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { wrap, HttpError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { getRecentReplies, handleInboundReply } from '../services/replies.js';
import { normalizeUsername } from '../lib/http.js';

export const repliesRouter = Router();
repliesRouter.use(requireAuth);

repliesRouter.get(
  '/',
  wrap(async (_req, res) => {
    const list = await getRecentReplies(50);
    res.json({ replies: list });
  }),
);

// Manually log a creator reply (e.g. seen in the Instagram app)
repliesRouter.post(
  '/manual',
  wrap(async (req, res) => {
    const username = normalizeUsername(String(req.body.username ?? ''));
    const text = String(req.body.text ?? '').trim();
    const platform = req.body.platform === 'comment' ? 'comment' : 'dm';
    if (!username || !text) throw new HttpError(400, 'username and text are required');
    const [creator] = await db.select().from(creators).where(eq(creators.username, username)).limit(1);
    if (!creator) throw new HttpError(404, `Creator @${username} not found — add them first.`);
    const reply = await handleInboundReply({
      creatorId: creator.id,
      platform,
      text,
      mediaRef: req.body.mediaRef ?? null,
      ourText: req.body.ourText ?? null,
      raw: { manual: true },
    });
    res.status(201).json({ reply });
  }),
);

repliesRouter.post(
  '/:id/mark-notified',
  wrap(async (req, res) => {
    await db.update(replies).set({ notified: true }).where(eq(replies.id, req.params.id));
    res.json({ ok: true });
  }),
);

void desc;
