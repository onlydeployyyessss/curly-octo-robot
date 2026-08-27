// ============================================================
// Instagram accounts — official Meta OAuth connection.
// We NEVER ask for passwords, cookies, or sessions. Tokens are
// encrypted at rest (AES-256-GCM). Max 5 accounts.
// ============================================================
import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../db/client.js';
import { actionLogs, campaigns, instagramAccounts } from '../db/schema.js';
import { and, eq, gte, sql } from 'drizzle-orm';
import { wrap, HttpError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { encrypt } from '../lib/crypto.js';
import { env } from '../env.js';
import { buildOauthUrl, exchangeCodeForToken } from '../services/instagram.js';
import { recordSystemError } from '../lib/audit.js';
import { MAX_INSTAGRAM_ACCOUNTS } from '@pc/shared';
import { toAccountDTO } from './mappers.js';

export const accountsRouter = Router();

function signState(state: string): string {
  return createHmac('sha256', env.sessionSecret).update(state).digest('hex');
}

function verifyState(state: string, signature: string): boolean {
  const expected = signState(state);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

accountsRouter.use(requireAuth);

accountsRouter.get(
  '/',
  wrap(async (_req, res) => {
    const accounts = await db.select().from(instagramAccounts).orderBy(instagramAccounts.createdAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const stats = await db
      .select({
        accountId: actionLogs.accountId,
        todayActions: sql<number>`count(*) filter (where ${actionLogs.ts} >= ${today} and ${actionLogs.status} = 'success')::int`,
      })
      .from(actionLogs)
      .where(gte(actionLogs.ts, today))
      .groupBy(actionLogs.accountId);
    const activeCampaigns = await db
      .select({ accountId: campaigns.accountId, c: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(eq(campaigns.status, 'active'))
      .groupBy(campaigns.accountId);

    res.json({
      accounts: accounts.map((a) =>
        toAccountDTO(a, {
          activeCampaigns: activeCampaigns.find((c) => c.accountId === a.id)?.c ?? 0,
          todayActions: stats.find((s) => s.accountId === a.id)?.todayActions ?? 0,
        }),
      ),
      maxAccounts: MAX_INSTAGRAM_ACCOUNTS,
      configured: !!env.metaAppId,
    });
  }),
);

// Step 1: begin OAuth — returns the Meta authorization URL.
accountsRouter.post(
  '/connect',
  wrap(async (req, res) => {
    const count = await db.select({ c: sql<number>`count(*)::int` }).from(instagramAccounts);
    const connected = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(instagramAccounts)
      .where(and(eq(instagramAccounts.status, 'connected')));
    if ((connected[0]?.c ?? 0) >= MAX_INSTAGRAM_ACCOUNTS) {
      throw new HttpError(400, `You can connect at most ${MAX_INSTAGRAM_ACCOUNTS} Instagram accounts.`);
    }
    void count;
    const state = randomBytes(16).toString('hex');
    const sig = signState(state);
    const url = env.mockExternal
      ? `${env.appUrl}/api/instagram/callback?code=mock_code&state=${state}&sig=${sig}`
      : buildOauthUrl(state);
    await audit(req, 'instagram_oauth_started');
    res.json({ url, state, sig });
  }),
);

// Disconnect
accountsRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const [acc] = await db.select().from(instagramAccounts).where(eq(instagramAccounts.id, req.params.id)).limit(1);
    if (!acc) throw new HttpError(404, 'Account not found');
    await db
      .update(instagramAccounts)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(eq(instagramAccounts.id, acc.id));
    await audit(req, 'instagram_oauth_disconnected', 'account', acc.id, { username: acc.username });
    res.json({ ok: true });
  }),
);

// Mark expired/error accounts as reconnectable
accountsRouter.post(
  '/:id/reconnect',
  wrap(async (_req, res) => {
    const state = randomBytes(16).toString('hex');
    const sig = signState(state);
    const url = env.mockExternal
      ? `${env.appUrl}/api/instagram/callback?code=mock_code&state=${state}&sig=${sig}`
      : buildOauthUrl(state);
    res.json({ url });
  }),
);

// ---- OAuth callback (public — protected by signed state) ----
// Mounted outside requireAuth via the public router in server.ts.
export const oauthCallback = wrap(async (req, res) => {
  const { code, state, sig } = req.query as Record<string, string>;
  if (!code || !state || !sig || !verifyState(state, sig)) {
    throw new HttpError(400, 'Invalid or expired OAuth state. Please reconnect from the dashboard.');
  }
  try {
    const identity = await exchangeCodeForToken(code);
    await db
      .insert(instagramAccounts)
      .values({
        username: identity.username,
        igUserId: identity.igUserId,
        accountType: identity.accountType,
        accessTokenEnc: encrypt(identity.accessToken),
        tokenExpiresAt: identity.expiresAt,
        status: 'connected',
        scopes: identity.scopes,
        pageId: identity.pageId,
        lastSuccessAt: new Date(),
      })
      .onConflictDoUpdate({
        target: instagramAccounts.igUserId,
        set: {
          username: identity.username,
          accessTokenEnc: encrypt(identity.accessToken),
          tokenExpiresAt: identity.expiresAt,
          status: 'connected',
          scopes: identity.scopes,
          updatedAt: new Date(),
          lastError: null,
        },
      });
  } catch (err) {
    await recordSystemError('instagram', `OAuth callback failed: ${(err as Error).message}`, {
      errorClass: 'oauth_expired',
    });
    return res.redirect(`${env.appUrl}/accounts?oauth=error`);
  }
  res.redirect(`${env.appUrl}/accounts?oauth=success`);
});
