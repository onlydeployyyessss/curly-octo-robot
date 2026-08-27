// ============================================================
// PC Mission — shared domain constants
// ============================================================

export const MAX_INSTAGRAM_ACCOUNTS = 5;

export const CAMPAIGN_STATUSES = [
  'active',
  'waiting',
  'replied',
  'positive',
  'maybe',
  'declined',
  'blocked',
  'completed',
  'paused',
  'stopped',
  'error',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const RESPONSE_STATUSES = [
  'none',
  'replied',
  'positive',
  'maybe',
  'declined',
  'blocked',
] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const STATUS_META: Record<
  CampaignStatus,
  { label: string; emoji: string; tone: 'green' | 'yellow' | 'blue' | 'violet' | 'red' | 'gray' | 'orange' }
> = {
  active: { label: 'Active', emoji: '🟢', tone: 'green' },
  waiting: { label: 'Waiting', emoji: '🟡', tone: 'yellow' },
  replied: { label: 'Replied', emoji: '🔵', tone: 'blue' },
  positive: { label: 'Positive', emoji: '🟣', tone: 'violet' },
  maybe: { label: 'Maybe', emoji: '🟡', tone: 'yellow' },
  declined: { label: 'Declined', emoji: '🔴', tone: 'red' },
  blocked: { label: 'Blocked', emoji: '🔴', tone: 'red' },
  completed: { label: 'Completed', emoji: '✅', tone: 'blue' },
  paused: { label: 'Paused', emoji: '⏸️', tone: 'orange' },
  stopped: { label: 'Stopped', emoji: '🛑', tone: 'red' },
  error: { label: 'Error', emoji: '⚠️', tone: 'red' },
};

export const DASHBOARD_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'replied', label: 'Replied' },
  { key: 'positive', label: 'Positive' },
  { key: 'declined', label: 'Declined' },
  { key: 'completed', label: 'Completed' },
  { key: 'paused', label: 'Paused' },
  { key: 'error', label: 'Error' },
] as const;

export type ActionType =
  | 'dm_sent'
  | 'comment_posted'
  | 'dm_received'
  | 'comment_received'
  | 'message_prepared'
  | 'campaign_started'
  | 'campaign_paused'
  | 'campaign_resumed'
  | 'campaign_stopped'
  | 'campaign_completed'
  | 'campaign_restarted'
  | 'day_skipped'
  | 'creator_excluded'
  | 'oauth_connected'
  | 'oauth_expired'
  | 'oauth_disconnected'
  | 'report_sent'
  | 'instant_alert_sent'
  | 'automation_stopped'
  | 'automation_resumed'
  | 'test_sent'
  | 'ai_generated'
  | 'manual_action_required'
  | 'error';

export type ScheduledActionType = 'dm' | 'comment' | 'check_replies' | 'daily_report';

export type ActionStatus = 'pending' | 'locked' | 'done' | 'failed' | 'cancelled';

export type ErrorClass =
  | 'transient_network'
  | 'rate_limited'
  | 'oauth_expired'
  | 'permission_denied'
  | 'invalid_creator'
  | 'media_deleted'
  | 'blocked'
  | 'duplicate'
  | 'ai_failure'
  | 'telegram_failure'
  | 'database'
  | 'permanent_other';

// Errors that must NOT be retried indefinitely.
export const PERMANENT_ERROR_CLASSES: ErrorClass[] = [
  'oauth_expired',
  'permission_denied',
  'invalid_creator',
  'media_deleted',
  'blocked',
  'duplicate',
  'permanent_other',
];

export const DEFAULT_MAX_DAYS = 5;
export const DEFAULT_REPORT_TIME = '09:00';
export const DEFAULT_DM_TIME = '10:00';

export const DEFAULT_DM_TEMPLATES: Record<number, string> = {
  1: 'Day 1 asking for a PC 😭',
  2: 'Day 2 asking for a PC 😂',
  3: 'Day 3 asking for a PC 🙏',
  4: 'Day 4 asking for a PC 💀',
  5: 'Day 5 asking for a PC 👀',
};

export const DEFAULT_COMMENT_TEMPLATES: Record<number, string> = {
  1: 'Day 1 asking for a PC 😭',
  2: 'Day 2 asking for a PC 😂',
  3: 'Day 3 asking for a PC 🙏',
  4: 'Day 4 asking for a PC 💀',
  5: 'Day 5 asking for a PC 👀',
};

export const TELEGRAM_COMMANDS = [
  { command: '/start', description: 'Register this chat and show the welcome message' },
  { command: '/status', description: 'Live mission snapshot' },
  { command: '/report', description: 'The full daily report, on demand' },
  { command: '/creators', description: 'Active creators and campaign days' },
  { command: '/replies', description: 'Latest creator replies' },
  { command: '/errors', description: 'Recent system errors' },
  { command: '/pause', description: 'Pause ALL automated outreach (emergency)' },
  { command: '/resume', description: 'Resume automation after a pause' },
];
