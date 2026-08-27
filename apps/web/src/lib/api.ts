// ============================================================
// API client. Talks to the Node backend over fetch (same origin
// in production, Vite proxy in dev). When VITE_DEMO_MODE=1 it
// serves a fully interactive in-memory demo dataset.
// ============================================================
import type {
  ActivityEventDTO,
  AppSettingsDTO,
  CampaignDTO,
  CreatorDTO,
  DashboardStats,
  InstagramAccountDTO,
  ReplyDTO,
  TelegramSettingsDTO,
  TemplateDTO,
  UserDTO,
} from '@pc/shared';
import {
  mockAccounts,
  mockActivity,
  mockCampaigns,
  mockCreators,
  mockReplies,
  mockSettings,
  mockStats,
  mockTelegram,
  mockTemplates,
} from './mockData';

export const DEMO_MODE =
  (import.meta.env.VITE_DEMO_MODE ?? '0') === '1' ||
  (typeof window !== 'undefined' && (window.location.hostname.includes('e2b.app') && false));

const BASE = import.meta.env.VITE_API_URL || '';

async function http<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

// ---------- Demo state (mutable copy) ----------
const demo = {
  user: null as UserDTO | null,
  creators: [...mockCreators] as CreatorDTO[],
  campaigns: [...mockCampaigns] as CampaignDTO[],
  accounts: [...mockAccounts] as InstagramAccountDTO[],
  replies: [...mockReplies] as ReplyDTO[],
  activity: [...mockActivity] as ActivityEventDTO[],
  templates: [...mockTemplates] as TemplateDTO[],
  stats: { ...mockStats } as DashboardStats,
  telegram: { ...mockTelegram } as TelegramSettingsDTO,
  settings: { ...mockSettings } as AppSettingsDTO,
};

function demoWait() {
  return new Promise((r) => setTimeout(r, 250 + Math.random() * 350));
}

function logDemo(action: string, content: string, creator?: string) {
  demo.activity.unshift({
    id: `ev-${Date.now()}-${Math.random()}`,
    ts: new Date().toISOString(),
    creatorUsername: creator ?? null,
    accountUsername: 'teles_pc_mission',
    actionType: action,
    campaignDay: null,
    content,
    status: 'success',
    errorMessage: null,
    metadata: null,
  });
}

// ---------- Public API ----------
export const api = {
  // auth
  async bootstrap(): Promise<{ needsSetup: boolean; demoMode: boolean }> {
    if (DEMO_MODE) return { needsSetup: false, demoMode: true };
    return http('/api/auth/bootstrap');
  },
  async setup(payload: { name: string; email: string; password: string }) {
    if (DEMO_MODE) {
      demo.user = { id: 'u1', email: payload.email, name: payload.name, role: 'admin', createdAt: new Date().toISOString() };
      return { user: demo.user };
    }
    return http<{ user: UserDTO }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(payload) });
  },
  async login(email: string, password: string) {
    if (DEMO_MODE) {
      await demoWait();
      demo.user = { id: 'u1', email, name: 'Mission Control', role: 'admin', createdAt: new Date().toISOString() };
      return { user: demo.user };
    }
    return http<{ user: UserDTO }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  async logout() {
    if (DEMO_MODE) return { ok: true };
    return http('/api/auth/logout', { method: 'POST' });
  },
  async me(): Promise<{ user: UserDTO } | null> {
    if (DEMO_MODE) return demo.user ? { user: demo.user } : null;
    return http<{ user: UserDTO }>('/api/auth/me').catch(() => null);
  },

  // dashboard
  async stats(): Promise<DashboardStats> {
    if (DEMO_MODE) {
      await demoWait();
      return { ...demo.stats, automationEnabled: demo.settings.automationEnabled };
    }
    return (await http<{ stats: DashboardStats }>('/api/dashboard/stats')).stats;
  },

  // creators
  async creators(filters: { status?: string; q?: string } = {}): Promise<CreatorDTO[]> {
    if (DEMO_MODE) {
      await demoWait();
      let list = [...demo.creators];
      if (filters.status && filters.status !== 'all') {
        list = list.filter((c) =>
          ['replied', 'positive', 'maybe', 'declined', 'blocked'].includes(filters.status!)
            ? c.responseStatus === filters.status
            : c.status === filters.status,
        );
      }
      if (filters.q) list = list.filter((c) => c.username.includes(filters.q!.toLowerCase()));
      return list;
    }
    const qs = new URLSearchParams();
    if (filters.status) qs.set('status', filters.status);
    if (filters.q) qs.set('q', filters.q);
    return (await http<{ creators: CreatorDTO[] }>(`/api/creators?${qs}`)).creators;
  },

  async addCreator(payload: Record<string, unknown>): Promise<CreatorDTO> {
    if (DEMO_MODE) {
      await demoWait();
      const username = String(payload.username).replace(/^@/, '').toLowerCase();
      const c: CreatorDTO = {
        id: `cr-${Date.now()}`,
        username,
        profileUrl: `https://instagram.com/${username}`,
        igId: null,
        accountId: 'acc-1',
        accountUsername: 'teles_pc_mission',
        status: payload.autoStart === false ? 'waiting' : 'active',
        responseStatus: 'none',
        startDate: new Date().toISOString().slice(0, 10),
        currentDay: payload.autoStart === false ? 0 : 1,
        maxDays: Number(payload.maxDays ?? 5),
        dmEnabled: payload.dmEnabled !== false,
        commentEnabled: payload.commentEnabled !== false,
        notes: (payload.notes as string) || null,
        excluded: false,
        lastInteractionAt: null,
        lastDmAt: null,
        lastCommentAt: null,
        lastResponseAt: null,
        nextAction: payload.autoStart === false ? 'Start campaign' : 'Day 2 DM scheduled',
        createdAt: new Date().toISOString(),
      };
      demo.creators.unshift(c);
      demo.stats.totalCreators += 1;
      if (c.status === 'active') {
        demo.stats.activeCampaigns += 1;
        demo.stats.today.newCreators += 1;
        logDemo('campaign_started', 'Campaign started — 5 day plan.', c.username);
        logDemo('dm_sent', 'Day 1 asking for a PC 😭', c.username);
        demo.stats.today.dms += 1;
        demo.stats.dmsSent += 1;
        c.lastDmAt = new Date().toISOString();
        c.lastInteractionAt = new Date().toISOString();
      }
      return c;
    }
    const r = await http<{ creator: CreatorDTO }>('/api/creators', { method: 'POST', body: JSON.stringify(payload) });
    return r.creator;
  },

  async creatorControl(id: string, action: string) {
    if (DEMO_MODE) {
      await demoWait();
      const c = demo.creators.find((x) => x.id === id);
      if (!c) return;
      switch (action) {
        case 'start':
        case 'resume':
          c.status = 'active';
          c.nextAction = `Day ${c.currentDay + 1} DM scheduled`;
          demo.stats.activeCampaigns += 1;
          logDemo(action === 'resume' ? 'campaign_resumed' : 'campaign_started', 'Campaign active.', c.username);
          break;
        case 'restart':
          c.status = 'active';
          c.responseStatus = 'none';
          c.currentDay = 1;
          c.nextAction = 'Day 2 DM scheduled';
          logDemo('campaign_restarted', 'Campaign restarted.', c.username);
          break;
        case 'pause':
          c.status = 'paused';
          c.nextAction = 'Paused';
          logDemo('campaign_paused', 'Manually paused.', c.username);
          break;
        case 'stop':
          c.status = 'stopped';
          c.nextAction = 'Stopped';
          demo.stats.activeCampaigns = Math.max(0, demo.stats.activeCampaigns - 1);
          logDemo('campaign_stopped', 'Campaign stopped.', c.username);
          break;
        case 'exclude':
          c.excluded = true;
          c.status = 'stopped';
          c.nextAction = 'Excluded';
          logDemo('creator_excluded', 'Creator excluded from campaign.', c.username);
          break;
        case 'skip_day':
          c.currentDay += 1;
          logDemo('day_skipped', `Skipped to day ${c.currentDay}.`, c.username);
          break;
      }
      return { ok: true };
    }
    return http(`/api/creators/${id}/control`, { method: 'POST', body: JSON.stringify({ action }) });
  },

  async updateCreator(id: string, patch: Record<string, unknown>) {
    if (DEMO_MODE) {
      Object.assign(demo.creators.find((x) => x.id === id) ?? {}, patch);
      return { ok: true };
    }
    return http(`/api/creators/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async deleteCreator(id: string) {
    if (DEMO_MODE) {
      demo.creators = demo.creators.filter((c) => c.id !== id);
      return { ok: true };
    }
    return http(`/api/creators/${id}`, { method: 'DELETE' });
  },

  async conversation(id: string) {
    if (DEMO_MODE) {
      await demoWait();
      const c = demo.creators.find((x) => x.id === id)!;
      const thread = demo.activity
        .filter((a) => a.creatorUsername === c.username && ['dm_sent', 'comment_posted', 'dm_received', 'comment_received'].includes(a.actionType))
        .map((a) => ({
          id: a.id,
          ts: a.ts,
          direction: a.actionType.includes('received') ? 'in' : 'out',
          channel: a.actionType.startsWith('comment') ? 'comment' : 'dm',
          text: a.content ?? '',
          status: a.status,
          day: a.campaignDay,
        }));
      const incoming = demo.replies
        .filter((r) => r.creatorUsername === c.username)
        .map((r) => ({ id: r.id, ts: r.ts, direction: 'in', channel: r.platform, text: r.text, status: 'success', day: null, sentiment: r.sentiment }));
      return { creator: c, campaignDay: c.currentDay, thread: [...thread, ...incoming].sort((a, b) => a.ts.localeCompare(b.ts)) };
    }
    return http(`/api/creators/${id}/conversation`);
  },

  async exclusions() {
    if (DEMO_MODE) {
      return { exclusions: demo.creators.filter((c) => c.excluded).map((c) => ({ username: c.username, reason: 'Manual exclusion', createdAt: c.createdAt })) };
    }
    return http('/api/creators/exclusions');
  },

  // campaigns
  async campaigns(): Promise<CampaignDTO[]> {
    if (DEMO_MODE) return demo.campaigns;
    return (await http<{ campaigns: CampaignDTO[] }>('/api/campaigns')).campaigns;
  },
  async saveConfig(payload: unknown) {
    if (DEMO_MODE) {
      logDemo('campaign_started', 'Campaign configuration updated.');
      return { ok: true };
    }
    return http('/api/campaigns/config', { method: 'PUT', body: JSON.stringify(payload) });
  },
  async queue() {
    if (DEMO_MODE) {
      return {
        queue: demo.creators
          .filter((c) => c.status === 'active')
          .slice(0, 8)
          .map((c, i) => ({
            id: `q-${i}`,
            idempotencyKey: `dm:${c.id}:day${c.currentDay + 1}:tomorrow`,
            type: 'dm',
            creatorUsername: c.username,
            campaignDay: c.currentDay + 1,
            scheduledAt: new Date(Date.now() + (i + 1) * 3600_000).toISOString(),
            status: 'pending',
            attempts: 0,
            lastError: null,
          })),
      };
    }
    return http('/api/campaigns/queue/upcoming');
  },

  // accounts
  async accounts(): Promise<{ accounts: InstagramAccountDTO[]; maxAccounts: number; configured: boolean }> {
    if (DEMO_MODE) return { accounts: demo.accounts, maxAccounts: 5, configured: true };
    return http('/api/accounts');
  },
  async connectUrl(): Promise<{ url: string }> {
    if (DEMO_MODE) {
      await demoWait();
      const acc: InstagramAccountDTO = {
        id: `acc-${Date.now()}`,
        username: `connected_account_${demo.accounts.length + 1}`,
        igUserId: `1789${Date.now()}`,
        status: 'connected',
        accountType: 'business',
        scopes: 'instagram_basic,instagram_manage_messages,instagram_manage_comments',
        tokenExpiresAt: new Date(Date.now() + 5184000000).toISOString(),
        activeCampaigns: 0,
        todayActions: 0,
        errors: 0,
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        createdAt: new Date().toISOString(),
      };
      demo.accounts.push(acc);
      logDemo('oauth_connected', `Instagram account @${acc.username} connected.`);
      return { url: '' };
    }
    return http('/api/accounts/connect', { method: 'POST' });
  },
  async disconnectAccount(id: string) {
    if (DEMO_MODE) {
      const a = demo.accounts.find((x) => x.id === id);
      if (a) a.status = 'disconnected';
      return { ok: true };
    }
    return http(`/api/accounts/${id}`, { method: 'DELETE' });
  },

  // templates / messages
  async templates(): Promise<TemplateDTO[]> {
    if (DEMO_MODE) return demo.templates;
    return (await http<{ templates: TemplateDTO[] }>('/api/templates')).templates;
  },
  async saveTemplates(templates: { channel: 'dm' | 'comment'; dayNumber: number; content: string }[]) {
    if (DEMO_MODE) {
      for (const t of templates) {
        const found = demo.templates.find((x) => x.channel === t.channel && x.dayNumber === t.dayNumber);
        if (found) found.content = t.content;
      }
      return { ok: true };
    }
    return http('/api/templates/bulk', { method: 'PUT', body: JSON.stringify({ templates }) });
  },
  async generateMessage(creatorId: string, channel: 'dm' | 'comment', dayNumber?: number) {
    if (DEMO_MODE) {
      await demoWait();
      const c = demo.creators.find((x) => x.id === creatorId);
      const aiOn = demo.settings.aiPersonalization;
      const day = dayNumber ?? Math.max(1, c?.currentDay ?? 1);
      const base = `Day ${day} asking for a PC ${['😭', '😂', '🙏', '💀', '👀'][day - 1] ?? '🙏'}`;
      const ai = channel === 'dm'
        ? `Hey @${c?.username ?? 'creator'} 😭 day ${day} of politely asking if you could help a guy get a PC setup. Your reels are insane — no pressure, just keeping the streak alive 🙏`
        : `Day ${day} asking for a PC 🙏 still not giving up lol`;
      return { message: aiOn ? ai : base, source: aiOn ? 'ai' : 'template', day };
    }
    return http<{ message: string; source: string; day: number }>('/api/templates/generate', { method: 'POST', body: JSON.stringify({ creatorId, channel, dayNumber }) });
  },
  async sendTest(message: string, toTelegram = false) {
    if (DEMO_MODE) {
      logDemo('test_sent', message);
      return { ok: true };
    }
    return http('/api/templates/send-test', { method: 'POST', body: JSON.stringify({ message, toTelegram }) });
  },

  // replies
  async replies(): Promise<ReplyDTO[]> {
    if (DEMO_MODE) return demo.replies;
    return (await http<{ replies: ReplyDTO[] }>('/api/replies')).replies;
  },
  async manualReply(payload: { username: string; text: string; platform: 'dm' | 'comment' }) {
    if (DEMO_MODE) {
      const c = demo.creators.find((x) => x.username === payload.username.replace(/^@/, '').toLowerCase());
      if (!c) throw new Error(`Creator @${payload.username} not found — add them first.`);
      const r: ReplyDTO = {
        id: `rp-${Date.now()}`,
        creatorId: c.id,
        creatorUsername: c.username,
        accountUsername: 'teles_pc_mission',
        platform: payload.platform,
        text: payload.text,
        ourText: null,
        mediaRef: null,
        sentiment: 'replied',
        ts: new Date().toISOString(),
        notified: false,
      };
      demo.replies.unshift(r);
      c.responseStatus = 'replied';
      c.status = 'replied';
      c.nextAction = 'Automation paused — replied';
      c.lastResponseAt = r.ts;
      demo.stats.creatorReplies += 1;
      demo.stats.today.replies += 1;
      logDemo('dm_received', payload.text, c.username);
      logDemo('campaign_paused', 'Creator replied — automation paused.', c.username);
      return { reply: r };
    }
    return http('/api/replies/manual', { method: 'POST', body: JSON.stringify(payload) });
  },

  // activity
  async activity(params: { limit?: number; creatorId?: string } = {}): Promise<ActivityEventDTO[]> {
    if (DEMO_MODE) {
      let list = [...demo.activity];
      if (params.creatorId) {
        const c = demo.creators.find((x) => x.id === params.creatorId);
        list = list.filter((a) => a.creatorUsername === c?.username);
      }
      return list.slice(0, params.limit ?? 100);
    }
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.creatorId) qs.set('creatorId', params.creatorId);
    return (await http<{ events: ActivityEventDTO[] }>(`/api/activity?${qs}`)).events;
  },
  async errors() {
    if (DEMO_MODE) {
      return {
        errors: [
          {
            id: 'err-1',
            ts: new Date(Date.now() - 5 * 3600_000).toISOString(),
            service: 'instagram',
            errorClass: 'rate_limited',
            message: 'Instagram API rate limit reached — action rescheduled with backoff.',
            resolved: false,
            context: null,
          },
        ],
      };
    }
    return http<{ errors: any[] }>('/api/errors');
  },
  async resolveErrors() {
    if (DEMO_MODE) return { ok: true };
    return http('/api/errors/resolve-all', { method: 'POST' });
  },

  // telegram
  async telegramSettings(): Promise<TelegramSettingsDTO> {
    if (DEMO_MODE) return demo.telegram;
    return (await http<{ settings: TelegramSettingsDTO }>('/api/telegram/settings')).settings;
  },
  async saveTelegramSettings(patch: Partial<TelegramSettingsDTO>) {
    if (DEMO_MODE) {
      Object.assign(demo.telegram, patch);
      return { ok: true };
    }
    return http('/api/telegram/settings', { method: 'PUT', body: JSON.stringify(patch) });
  },
  async telegramTest() {
    if (DEMO_MODE) {
      logDemo('test_sent', 'Telegram connection test message.');
      return { ok: true };
    }
    return http('/api/telegram/test', { method: 'POST' });
  },
  async reportNow() {
    if (DEMO_MODE) {
      logDemo('report_sent', 'Daily report delivered to Telegram.');
      return { sent: true, message: '🤖 PC MISSION — DAILY REPORT (demo)' };
    }
    return http<{ sent: boolean; message: string }>('/api/telegram/report-now', { method: 'POST' });
  },

  // settings
  async settings(): Promise<AppSettingsDTO> {
    if (DEMO_MODE) return demo.settings;
    return (await http<{ settings: AppSettingsDTO }>('/api/settings')).settings;
  },
  async saveSettings(patch: Partial<AppSettingsDTO>) {
    if (DEMO_MODE) {
      Object.assign(demo.settings, patch);
      demo.stats.automationEnabled = demo.settings.automationEnabled;
      if (patch.automationEnabled === false) logDemo('automation_stopped', '🛑 STOP ALL AUTOMATION triggered.');
      if (patch.automationEnabled === true) logDemo('automation_resumed', 'Automation resumed globally.');
      return { settings: demo.settings };
    }
    return http('/api/settings', { method: 'PUT', body: JSON.stringify(patch) });
  },
  async emergencyStop() {
    if (DEMO_MODE) {
      demo.settings.automationEnabled = false;
      demo.stats.automationEnabled = false;
      for (const c of demo.creators) if (c.status === 'active') c.status = 'paused';
      logDemo('automation_stopped', '🛑 STOP ALL AUTOMATION triggered.');
      return { ok: true };
    }
    return http('/api/settings/emergency-stop', { method: 'POST' });
  },
  async audit() {
    if (DEMO_MODE) {
      return {
        events: demo.activity.slice(0, 30).map((a, i) => ({
          id: `aud-${i}`,
          ts: a.ts,
          action: a.actionType,
          entity: 'creator',
          entityId: null,
          ip: '203.0.113.10',
        })),
      };
    }
    return http<{ events: any[] }>('/api/settings/audit');
  },
};
