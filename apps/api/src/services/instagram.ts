// ============================================================
// Official Meta / Instagram integration.
//
// Uses ONLY the Instagram Graph API + Facebook Login (OAuth):
//   - OAuth authorization code exchange (long-lived tokens)
//   - Instagram Messaging "Send API" for DMs
//   - Comments API for post/reel comments
//   - Media + comment reads for response detection
//
// We never request or store passwords, cookies, or session data.
// When a capability is not granted by the authorized scopes, the
// service throws `permission_denied` and the UI shows
// "API permission unavailable — manual action required."
// No attempt is ever made to bypass platform restrictions.
// ============================================================
import { env } from '../env.js';
import { ExternalApiError } from '../lib/http.js';
import type { ErrorClass } from '@pc/shared';

const GRAPH = 'https://graph.facebook.com';

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
  };
}

function classifyError(status: number, body: GraphErrorBody): ErrorClass {
  const e = body.error;
  const code = e?.code ?? 0;
  const sub = e?.error_subcode ?? 0;
  // OAuth errors: 190 (token), 200 (permissions), subcodes 458/459/460/463/464/467
  if (code === 190 || [458, 459, 460, 463, 464, 467].includes(sub)) return 'oauth_expired';
  if (code === 10 || code === 200 || code === 100 || code === 33) return 'permission_denied';
  if (code === 4 || code === 17 || code === 32 || status === 429) return 'rate_limited';
  if (code === 200 || /blocked|block/i.test(e?.message ?? '')) return 'blocked';
  if (status >= 500) return 'transient_network';
  if (status === 0 || status === 502 || status === 503) return 'transient_network';
  return 'permanent_other';
}

async function graphFetch(path: string, init: RequestInit = {}, token?: string): Promise<any> {
  if (env.mockExternal || !env.metaAppId || !token) {
    return mockGraphCall(path, init);
  }
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${env.metaGraphVersion}${path}`, init);
  } catch (err) {
    throw new ExternalApiError('transient_network', `Network error calling Instagram: ${(err as Error).message}`);
  }
  const text = await res.text();
  let body: GraphErrorBody = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: { message: text.slice(0, 200) } };
  }
  if (!res.ok || body.error) {
    const cls = classifyError(res.status, body);
    throw new ExternalApiError(
      cls,
      body.error?.error_user_msg || body.error?.message || `Instagram API error (${res.status})`,
      { code: body.error?.code, subcode: body.error?.error_subcode, path },
    );
  }
  return body;
}

// ---------- OAuth ----------
export function buildOauthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.metaAppId,
    redirect_uri: env.metaRedirectUri,
    state,
    response_type: 'code',
    scope: [
      'instagram_basic',
      'instagram_manage_insights',
      'instagram_manage_comments',
      'instagram_manage_messages',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_messaging',
    ].join(','),
  });
  return `https://www.facebook.com/${env.metaGraphVersion}/dialog/oauth?${params.toString()}`;
}

export interface OauthIdentity {
  accessToken: string;
  expiresAt: Date | null;
  igUserId: string | null;
  username: string | null;
  accountType: string | null;
  pageId: string | null;
  scopes: string | null;
}

export async function exchangeCodeForToken(code: string): Promise<OauthIdentity> {
  if (env.mockExternal || !env.metaAppId) {
    return {
      accessToken: 'mock-long-lived-token',
      expiresAt: new Date(Date.now() + 60 * 864e5),
      igUserId: `178${Math.floor(1000000000 + Math.random() * 8999999999)}`,
      username: `pc_mission_${Math.floor(1 + Math.random() * 50)}`,
      accountType: 'business',
      pageId: 'mock_page_1',
      scopes: 'instagram_basic,instagram_manage_messages,instagram_manage_comments',
    };
  }
  // 1) Short-lived user token
  const short = await graphFetch(
    `/oauth/access_token?client_id=${env.metaAppId}&client_secret=${env.metaAppSecret}&redirect_uri=${encodeURIComponent(env.metaRedirectUri)}&code=${encodeURIComponent(code)}`,
  );
  // 2) Exchange for long-lived token (~60 days)
  const long = await graphFetch(
    `/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.metaAppId}&client_secret=${env.metaAppSecret}&fb_exchange_token=${short.access_token}`,
  );
  const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : null;

  // 3) Resolve connected Instagram business account(s) via Pages
  const pages = await graphFetch(
    `/me/accounts?fields=id,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${long.access_token}`,
  );
  const page = pages.data?.[0];
  const ig = page?.instagram_business_account;
  return {
    accessToken: long.access_token as string,
    expiresAt,
    igUserId: ig?.id ? String(ig.id) : null,
    username: ig?.username ?? null,
    accountType: 'business',
    pageId: page?.id ? String(page.id) : null,
    scopes: 'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_messaging',
  };
}

// ---------- Outreach ----------
export interface SendResult {
  ok: boolean;
  externalId: string | null;
  raw: Record<string, unknown>;
}

/** Send a DM through the Instagram Messaging Send API (official). */
export async function sendDirectMessage(
  token: string,
  senderIgId: string,
  recipientIgId: string,
  text: string,
): Promise<SendResult> {
  const body = {
    recipient: { id: recipientIgId },
    message: { text },
  };
  const res = await graphFetch(
    `/${senderIgId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    token,
  );
  return { ok: true, externalId: res.message_id ?? null, raw: res };
}

/** Post a comment on a post/reel through the Comments API (official). */
export async function postComment(
  token: string,
  mediaId: string,
  text: string,
): Promise<SendResult> {
  const res = await graphFetch(
    `/${mediaId}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    },
    token,
  );
  return { ok: true, externalId: res.id ?? null, raw: res };
}

/** Recent media for the connected account (to find creator posts/reels). */
export async function getRecentMedia(
  token: string,
  igUserId: string,
): Promise<Array<{ id: string; mediaType: string; permalink: string; timestamp: string }>> {
  const res = await graphFetch(
    `/${igUserId}/media?fields=id,media_type,permalink,timestamp&limit=25`,
    { method: 'GET' },
    token,
  );
  return (res.data ?? []).map((m: any) => ({
    id: String(m.id),
    mediaType: m.media_type,
    permalink: m.permalink,
    timestamp: m.timestamp,
  }));
}

/**
 * Fetch comments on a media object. Used for comment-reply detection
 * when the `instagram_manage_comments` webhook is not configured.
 */
export async function getMediaComments(
  token: string,
  mediaId: string,
): Promise<Array<{ id: string; text: string; fromId: string; fromUsername: string; timestamp: string }>> {
  const res = await graphFetch(
    `/${mediaId}/comments?fields=id,text,from{id,username},timestamp&limit=50`,
    { method: 'GET' },
    token,
  );
  return (res.data ?? []).map((c: any) => ({
    id: String(c.id),
    text: c.text,
    fromId: c.from?.id ? String(c.from.id) : '',
    fromUsername: c.from?.username ?? '',
    timestamp: c.timestamp,
  }));
}

/**
 * Fetch a creator's recent media via business discovery. Used to select
 * a post/reel to comment on. Requires instagram_basic + business
 * discovery on the authorized token; if unavailable, the caller treats
 * it as "API permission unavailable — manual action required."
 */
export async function getCreatorMedia(
  token: string,
  senderIgId: string,
  username: string,
): Promise<Array<{ id: string; mediaType: string; permalink: string; timestamp: string }>> {
  const res = await graphFetch(
    `/${senderIgId}?fields=business_discovery.username(${username}){media.latest(5){id,media_type,permalink,timestamp}}&access_token=${token}`,
  );
  const media = res?.business_discovery?.media?.data ?? [];
  return media.map((m: any) => ({
    id: String(m.id),
    mediaType: m.media_type,
    permalink: m.permalink ?? '',
    timestamp: m.timestamp ?? new Date().toISOString(),
  }));
}

/** Look up a creator's IG user id by username (requires business discovery). */
export async function resolveCreatorIgId(
  token: string,
  senderIgId: string,
  username: string,
): Promise<string | null> {
  try {
    const res = await graphFetch(
      `/${senderIgId}?fields=business_discovery.username(${username}){id,username,followers_count,media_count}&access_token=${token}`,
    );
    return res.business_discovery?.id ? String(res.business_discovery.id) : null;
  } catch (err) {
    if ((err as ExternalApiError).errorClass === 'permission_denied') return null;
    throw err;
  }
}

// ---------- Mock mode (local dev / demos / tests) ----------
let mockSeq = 0;
async function mockGraphCall(path: string, _init: RequestInit): Promise<any> {
  await new Promise((r) => setTimeout(r, 120));
  mockSeq += 1;
  if (path.includes('/messages')) {
    return { message_id: `mock_msg_${Date.now()}_${mockSeq}` };
  }
  if (path.includes('/comments')) {
    return { id: `mock_cmt_${Date.now()}_${mockSeq}` };
  }
  if (path.includes('/media?') && !path.includes('comments')) {
    return {
      data: [
        { id: 'mock_media_1', media_type: 'REEL', permalink: 'https://instagram.com/reel/mock1', timestamp: new Date().toISOString() },
        { id: 'mock_media_2', media_type: 'IMAGE', permalink: 'https://instagram.com/p/mock2', timestamp: new Date().toISOString() },
      ],
    };
  }
  if (path.includes('business_discovery')) {
    return {
      business_discovery: {
        id: `mock_ig_${mockSeq}`,
        username: 'creator',
        followers_count: 1234,
        media: {
          data: [
            { id: 'mock_creator_media_1', media_type: 'REEL', permalink: 'https://instagram.com/reel/creator-mock-1', timestamp: new Date().toISOString() },
          ],
        },
      },
    };
  }
  return { data: [] };
}
