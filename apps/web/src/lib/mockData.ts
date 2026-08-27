// Built-in demo dataset used when VITE_DEMO_MODE=1.
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
} from '@pc/shared';

const now = Date.now();
const iso = (hAgo: number) => new Date(now - hAgo * 3600_000).toISOString();

export const mockAccounts: (InstagramAccountDTO & { token?: string })[] = [
  {
    id: 'acc-1',
    username: 'teles_pc_mission',
    igUserId: '1789000000000001',
    status: 'connected',
    accountType: 'business',
    scopes: 'instagram_basic,instagram_manage_messages,instagram_manage_comments',
    tokenExpiresAt: iso(-24 * 50),
    activeCampaigns: 5,
    todayActions: 12,
    errors: 0,
    lastSuccessAt: iso(0.5),
    lastError: null,
    createdAt: iso(24 * 30),
  },
];

const creatorNames = [
  'techbro_tom', 'gamingqueen', 'pcbuildbros', 'setups_daily', 'rigking',
  'fpsgodess', 'techtokerindia', 'budgetbuilds', 'rgb_everything', 'noctua_fan',
  'gpu_scalper_no_more', 'streamer_sam', 'keyboardkween', 'monitor_maniac', 'overclock_ollie',
];

export const mockCreators: CreatorDTO[] = creatorNames.map((u, i) => {
  const day = (i % 5) + 1;
  const states: CreatorDTO['status'][] = ['active', 'active', 'active', 'waiting', 'replied', 'positive', 'declined', 'active', 'paused', 'active', 'active', 'active', 'completed', 'active', 'error'];
  const respStates: CreatorDTO['responseStatus'][] = ['none', 'none', 'none', 'none', 'replied', 'positive', 'declined', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'];
  const status = states[i];
  return {
    id: `cr-${i + 1}`,
    username: u,
    profileUrl: `https://instagram.com/${u}`,
    igId: `ig_${9000 + i}`,
    accountId: 'acc-1',
    accountUsername: 'teles_pc_mission',
    status,
    responseStatus: respStates[i],
    startDate: new Date(now - day * 86400_000).toISOString().slice(0, 10),
    currentDay: status === 'waiting' ? 0 : day,
    maxDays: 5,
    dmEnabled: true,
    commentEnabled: i % 4 !== 0,
    notes: i === 0 ? 'Big tech creator — very active in comments. Loves funny persistence.' : null,
    excluded: false,
    lastInteractionAt: iso((i % 6) + 1),
    lastDmAt: status === 'waiting' ? null : iso((i % 5) + 2),
    lastCommentAt: i % 4 === 0 ? null : iso((i % 7) + 3),
    lastResponseAt: ['replied', 'positive', 'declined'].includes(status) ? iso(i + 1) : null,
    nextAction:
      status === 'replied'
        ? 'Automation paused — replied'
        : status === 'positive'
          ? 'Automation paused — replied'
          : status === 'declined'
            ? 'Declined'
            : status === 'waiting'
              ? 'Start campaign'
              : status === 'completed'
                ? 'Completed'
                : `Day ${day + 1} DM scheduled`,
    createdAt: iso(24 * (i + 2)),
  };
});

export const mockReplies: ReplyDTO[] = [
  {
    id: 'rp-1',
    creatorId: 'cr-5',
    creatorUsername: 'fpsgodess',
    accountUsername: 'teles_pc_mission',
    platform: 'dm',
    text: 'Sure bro, send me your details. 😂 This "Day 4 asking" thing is killing me.',
    ourText: null,
    mediaRef: null,
    sentiment: 'positive',
    ts: iso(2),
    notified: true,
  },
  {
    id: 'rp-2',
    creatorId: 'cr-7',
    creatorUsername: 'techtokerindia',
    accountUsername: 'teles_pc_mission',
    platform: 'comment',
    text: 'Bro maybe 😂 keep cooking',
    ourText: 'Day 3 asking for a PC 🙏',
    mediaRef: 'https://instagram.com/reel/abc123',
    sentiment: 'maybe',
    ts: iso(5),
    notified: true,
  },
  {
    id: 'rp-3',
    creatorId: 'cr-6',
    creatorUsername: 'setups_daily',
    accountUsername: 'teles_pc_mission',
    platform: 'dm',
    text: "Yeah, I'll see what I can do. Send me your PC requirements.",
    ourText: null,
    mediaRef: null,
    sentiment: 'positive',
    ts: iso(8),
    notified: false,
  },
  {
    id: 'rp-4',
    creatorId: 'cr-8',
    creatorUsername: 'gpu_scalper_no_more',
    accountUsername: 'teles_pc_mission',
    platform: 'dm',
    text: 'Sorry bro, can\'t help with that. Good luck though!',
    ourText: null,
    mediaRef: null,
    sentiment: 'declined',
    ts: iso(26),
    notified: true,
  },
];

const actionTypes: ActivityEventDTO['actionType'][] = [
  'dm_sent', 'comment_posted', 'dm_received', 'campaign_paused', 'message_prepared',
  'comment_posted', 'dm_sent', 'campaign_started', 'manual_action_required', 'dm_sent',
];
const contents = [
  'Day 3 asking for a PC 🙏',
  'Day 2 asking for a PC 😂',
  'Day 4 asking for a PC 💀',
  'Day 1 asking for a PC 😭',
  'Sure bro, send me your details. 😂',
  'Day 5 asking for a PC 👀',
  'API permission unavailable — manual action required.',
];

export const mockActivity: ActivityEventDTO[] = Array.from({ length: 28 }, (_, i) => {
  const c = mockCreators[i % mockCreators.length];
  const type = actionTypes[i % actionTypes.length];
  const isReply = type.includes('received');
  return {
    id: `ev-${i}`,
    ts: iso(i * 1.3),
    creatorUsername: c.username,
    accountUsername: 'teles_pc_mission',
    actionType: type,
    campaignDay: (i % 5) + 1,
    content: isReply ? mockReplies[i % mockReplies.length].text : contents[i % contents.length],
    status: type === 'manual_action_required' ? 'info' : 'success',
    errorMessage: i === 9 ? null : null,
    metadata: null,
  };
});

export const mockTemplates: TemplateDTO[] = [
  ...Array.from({ length: 5 }, (_, i): TemplateDTO => ({
    id: `tpl-dm-${i + 1}`,
    name: `Day ${i + 1} DM`,
    channel: 'dm',
    dayNumber: i + 1,
    content: `Day ${i + 1} asking for a PC ${['😭', '😂', '🙏', '💀', '👀'][i]}`,
    aiEnabled: false,
    approved: true,
  })),
  ...Array.from({ length: 5 }, (_, i): TemplateDTO => ({
    id: `tpl-cmt-${i + 1}`,
    name: `Day ${i + 1} comment`,
    channel: 'comment',
    dayNumber: i + 1,
    content: `Day ${i + 1} asking for a PC ${['😭', '😂', '🙏', '💀', '👀'][i]}`,
    aiEnabled: false,
    approved: true,
  })),
];

export const mockCampaigns: CampaignDTO[] = mockCreators.slice(0, 8).map((c, i) => ({
  id: `cmp-${i + 1}`,
  creatorId: c.id,
  creatorUsername: c.username,
  accountId: 'acc-1',
  accountUsername: 'teles_pc_mission',
  status: c.status as CampaignDTO['status'],
  currentDay: c.currentDay,
  maxDays: 5,
  dmEnabled: true,
  commentEnabled: c.commentEnabled,
  startedAt: iso(24 * 6),
  completedAt: c.status === 'completed' ? iso(20) : null,
  pausedAt: ['replied', 'positive', 'paused', 'declined'].includes(c.status) ? iso(4) : null,
  stoppedAt: null,
  days: Array.from({ length: 5 }, (_, d) => ({
    id: `day-${i}-${d}`,
    dayNumber: d + 1,
    dmContent: `Day ${d + 1} asking for a PC`,
    commentContent: `Day ${d + 1} asking for a PC`,
    dmEnabled: true,
    commentEnabled: c.commentEnabled,
    dmSentAt: d < c.currentDay ? iso((c.currentDay - d) * 24) : null,
    commentSentAt: d < c.currentDay && c.commentEnabled ? iso((c.currentDay - d) * 24 + 1) : null,
    status: d < c.currentDay ? 'sent' : 'pending',
  })),
}));

export const mockStats: DashboardStats = {
  totalCreators: 15,
  activeCampaigns: 8,
  completedCampaigns: 1,
  dmsSent: 37,
  commentsSent: 29,
  creatorReplies: 4,
  positiveReplies: 2,
  declines: 1,
  errors: 1,
  currentCampaigns: [
    { status: 'active', count: 8 },
    { status: 'paused', count: 1 },
    { status: 'replied', count: 1 },
    { status: 'positive', count: 1 },
    { status: 'declined', count: 1 },
    { status: 'completed', count: 1 },
    { status: 'waiting', count: 1 },
    { status: 'error', count: 1 },
  ],
  daysActive: [
    { day: 1, count: 3 },
    { day: 2, count: 2 },
    { day: 3, count: 1 },
    { day: 4, count: 1 },
    { day: 5, count: 1 },
  ],
  today: { dms: 7, comments: 5, replies: 1, errors: 0, newCreators: 2 },
  pcReceived: false,
  positiveOpportunities: 2,
  automationEnabled: true,
};

export const mockTelegram: TelegramSettingsDTO = {
  chatId: '987654321',
  reportTime: '09:00',
  dailyReportEnabled: true,
  instantAlertsEnabled: true,
  authorizedIds: ['987654321'],
  lastReportAt: iso(26),
  botConfigured: true,
};

export const mockSettings: AppSettingsDTO = {
  aiPersonalization: false,
  aiModel: 'openai/gpt-4o-mini',
  automationEnabled: true,
  defaultMaxDays: 5,
  defaultDmTime: '10:00',
  autoApplyCampaign: true,
  stopOnReply: true,
  stopOnPositive: true,
  stopOnDecline: true,
  pcReceived: false,
};
