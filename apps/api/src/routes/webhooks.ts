// ============================================================
// Inbound webhooks:
//  - GET  /api/webhooks/meta   → Meta webhook verification
//  - POST /api/webhooks/meta   → Instagram DM + comment events
//  - POST /api/telegram/webhook → Telegram bot updates
// ============================================================
import { Router } from 'express';
import { wrap } from '../lib/http.js';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { creators, instagramAccounts, actionLogs } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { handleInboundReply } from '../services/replies.js';
import { handleUpdate, type TelegramUpdate } from '../services/telegram.js';
import { recordSystemError } from '../lib/audit.js';
import { logActivity } from '../services/campaign-engine.js';

export const metaWebhookRouter = Router();

// Verification handshake
metaWebhookRouter.get(
  '/',
  wrap((req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === env.metaWebhookVerify) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  }),
);

metaWebhookRouter.post(
  '/',
  wrap(async (req, res) => {
    // Always 200 quickly so Meta doesn't retry-storm; process async.
    res.sendStatus(200);
    try {
      const body = req.body;
      if (body?.object !== 'instagram' && body?.object !== 'page') return;

      for (const entry of body.entry ?? []) {
        // ---- Instagram Messaging (DMs) ----
        for (const messaging of entry.messaging ?? []) {
          const text: string | undefined = messaging?.message?.text;
          const senderId: string | undefined = messaging?.sender?.id;
          const recipientIg: string = entry.id ?? messaging?.recipient?.id;
          if (!text || !senderId) continue;
          if (messaging?.message?.is_echo) continue;

          const account = await db.query.instagramAccounts.findFirst({
            where: eq(instagramAccounts.igUserId, recipientIg),
          });
          let creator = await db.query.creators.findFirst({ where: eq(creators.igId, senderId) });
          if (!creator) continue; // unknown sender — do not auto-contact arbitrary users

          await handleInboundReply({
            creatorId: creator.id,
            platform: 'dm',
            text,
            externalId: messaging.message.mid,
            accountId: account?.id ?? creator.accountId,
            raw: messaging,
          });
        }

        // ---- Comments / comment replies ----
        for (const change of entry.changes ?? []) {
          if (change.field !== 'comments') continue;
          const v = change.value;
          const fromUsername: string | undefined = v?.from?.username;
          const text: string | undefined = v?.text;
          const mediaId: string | undefined = v?.media?.id ?? v?.media;
          const commentId: string | undefined = v?.id;
          if (!fromUsername || !text) continue;

          const creator = await db.query.creators.findFirst({
            where: eq(creators.username, fromUsername.toLowerCase().replace(/^@/, '')),
          });
          if (!creator) continue; // not a creator we are campaigning — ignore

          // Find our previous comment on this media (for context in the alert)
          const ourLog = await db
            .select({ content: actionLogs.content })
            .from(actionLogs)
            .where(
              and(
                eq(actionLogs.creatorId, creator.id),
                eq(actionLogs.actionType, 'comment_posted'),
              ),
            )
            .orderBy(desc(actionLogs.ts))
            .limit(1);

          await handleInboundReply({
            creatorId: creator.id,
            platform: 'comment',
            text,
            externalId: commentId,
            ourText: ourLog[0]?.content ?? null,
            mediaRef: mediaId ?? v?.permalink ?? null,
            accountId: creator.accountId,
            raw: v,
          });
        }
      }
    } catch (err) {
      await recordSystemError('instagram', `Webhook processing failed: ${(err as Error).message}`);
    }
  }),
);

export const telegramWebhookRouter = Router();
telegramWebhookRouter.post(
  '/',
  wrap(async (req, res) => {
    res.sendStatus(200);
    const update = req.body as TelegramUpdate;
    if (update?.update_id) {
      handleUpdate(update).catch((err) =>
        recordSystemError('telegram', `Webhook update failed: ${(err as Error).message}`),
      );
    }
  }),
);

void logActivity;
