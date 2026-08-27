// ============================================================
// PC Mission — PostgreSQL schema (Drizzle ORM)
// ============================================================
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';

const now = () => new Date();

// ---------- Auth ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    userIdx: index('idx_sessions_user').on(t.userId),
    expiresIdx: index('idx_sessions_expires').on(t.expiresAt),
  }),
);

// ---------- Instagram accounts (official OAuth tokens, encrypted at rest) ----------
export const instagramAccounts = pgTable(
  'instagram_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username'),
    igUserId: text('ig_user_id').unique(),
    accountType: text('account_type'),
    accessTokenEnc: text('access_token_enc').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    status: text('status').notNull().default('connected'), // connected|disconnected|expired|error
    scopes: text('scopes'),
    pageId: text('page_id'),
    profileJson: jsonb('profile_json').$type<Record<string, unknown>>(),
    errorCount: integer('error_count').notNull().default(0),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    statusIdx: index('idx_ig_accounts_status').on(t.status),
    igIdIdx: index('idx_ig_accounts_ig_user_id').on(t.igUserId),
  }),
);

// ---------- Creators ----------
export const creators = pgTable(
  'creators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(), // stored without @, lowercased
    profileUrl: text('profile_url'),
    igId: text('ig_id'),
    accountId: uuid('account_id').references(() => instagramAccounts.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('waiting'), // CampaignStatus
    responseStatus: text('response_status').notNull().default('none'), // ResponseStatus
    startDate: date('start_date'),
    currentDay: integer('current_day').notNull().default(0),
    maxDays: integer('max_days').notNull().default(5),
    dmEnabled: boolean('dm_enabled').notNull().default(true),
    commentEnabled: boolean('comment_enabled').notNull().default(true),
    notes: text('notes'),
    excluded: boolean('excluded').notNull().default(false),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
    lastDmAt: timestamp('last_dm_at', { withTimezone: true }),
    lastCommentAt: timestamp('last_comment_at', { withTimezone: true }),
    lastResponseAt: timestamp('last_response_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    usernameIdx: uniqueIndex('idx_creators_username').on(t.username),
    statusIdx: index('idx_creators_status').on(t.status),
    accountIdx: index('idx_creators_account').on(t.accountId),
    responseIdx: index('idx_creators_response').on(t.responseStatus),
  }),
);

// ---------- Campaigns (one per creator) ----------
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .unique()
      .references(() => creators.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => instagramAccounts.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('waiting'),
    currentDay: integer('current_day').notNull().default(0),
    maxDays: integer('max_days').notNull().default(5),
    dmEnabled: boolean('dm_enabled').notNull().default(true),
    commentEnabled: boolean('comment_enabled').notNull().default(true),
    scheduledTime: time('scheduled_time').notNull().default('10:00'),
    stopConditions: jsonb('stop_conditions')
      .$type<{ onReply: boolean; onPositive: boolean; onDecline: boolean }>()
      .notNull()
      .default({ onReply: true, onPositive: true, onDecline: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    statusIdx: index('idx_campaigns_status').on(t.status),
    accountIdx: index('idx_campaigns_account').on(t.accountId),
  }),
);

// ---------- Campaign day state ----------
export const campaignDays = pgTable(
  'campaign_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    dayNumber: integer('day_number').notNull(),
    dmEnabled: boolean('dm_enabled').notNull().default(true),
    commentEnabled: boolean('comment_enabled').notNull().default(true),
    dmContent: text('dm_content'),
    commentContent: text('comment_content'),
    dmSentAt: timestamp('dm_sent_at', { withTimezone: true }),
    commentSentAt: timestamp('comment_sent_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'), // pending|sent|partial|skipped|failed
  },
  (t) => ({
    campaignDayIdx: uniqueIndex('idx_campaign_days_campaign_day').on(
      t.campaignId,
      t.dayNumber,
    ),
  }),
);

// ---------- Approved message templates ----------
export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    channel: text('channel').notNull(), // dm|comment
    dayNumber: integer('day_number'),
    content: text('content').notNull(),
    aiEnabled: boolean('ai_enabled').notNull().default(false),
    approved: boolean('approved').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    channelDayIdx: index('idx_templates_channel_day').on(t.channel, t.dayNumber),
  }),
);

// ---------- Scheduler queue (idempotent, lockable) ----------
export const scheduledActions = pgTable(
  'scheduled_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    type: text('type').notNull(), // dm|comment|check_replies|daily_report
    creatorId: uuid('creator_id').references(() => creators.id, {
      onDelete: 'cascade',
    }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, {
      onDelete: 'cascade',
    }),
    accountId: uuid('account_id').references(() => instagramAccounts.id, {
      onDelete: 'set null',
    }),
    campaignDay: integer('campaign_day'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().default(now()),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'), // pending|locked|done|failed|cancelled
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    errorClass: text('error_class'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    idemIdx: uniqueIndex('idx_scheduled_idem').on(t.idempotencyKey),
    dueIdx: index('idx_scheduled_due').on(t.status, t.scheduledAt),
    retryIdx: index('idx_scheduled_retry').on(t.status, t.nextRetryAt),
    creatorIdx: index('idx_scheduled_creator').on(t.creatorId),
    typeIdx: index('idx_scheduled_type').on(t.type),
  }),
);

// ---------- Complete event history ----------
export const actionLogs = pgTable(
  'action_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ts: timestamp('ts', { withTimezone: true }).notNull().default(now()),
    creatorId: uuid('creator_id').references(() => creators.id, {
      onDelete: 'set null',
    }),
    accountId: uuid('account_id').references(() => instagramAccounts.id, {
      onDelete: 'set null',
    }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    actionType: text('action_type').notNull(),
    campaignDay: integer('campaign_day'),
    content: text('content'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('success'), // success|failed|info
    errorMessage: text('error_message'),
    idempotencyKey: text('idempotency_key'),
  },
  (t) => ({
    tsIdx: index('idx_logs_ts').on(t.ts),
    creatorIdx: index('idx_logs_creator').on(t.creatorId),
    accountIdx: index('idx_logs_account').on(t.accountId),
    typeIdx: index('idx_logs_type').on(t.actionType),
    statusIdx: index('idx_logs_status').on(t.status),
  }),
);

// ---------- Conversations & replies ----------
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => instagramAccounts.id, {
      onDelete: 'set null',
    }),
    platform: text('platform').notNull(), // dm|comment
    threadExternalId: text('thread_external_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    threadIdx: uniqueIndex('idx_conversations_thread').on(
      t.creatorId,
      t.platform,
      t.threadExternalId,
    ),
  }),
);

export const replies = pgTable(
  'replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => instagramAccounts.id, {
      onDelete: 'set null',
    }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    platform: text('platform').notNull(), // dm|comment
    externalId: text('external_id'),
    text: text('text').notNull(),
    ourText: text('our_text'),
    mediaRef: text('media_ref'), // post/reel id or permalink
    sentiment: text('sentiment').notNull().default('unknown'), // positive|maybe|declined|neutral|unknown
    notified: boolean('notified').notNull().default(false),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    ts: timestamp('ts', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    creatorIdx: index('idx_replies_creator').on(t.creatorId),
    tsIdx: index('idx_replies_ts').on(t.ts),
    accountIdx: index('idx_replies_account').on(t.accountId),
    platformIdx: index('idx_replies_platform').on(t.platform),
  }),
);

// ---------- Exclusion list ----------
export const excludedCreators = pgTable('excluded_creators', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
});

// ---------- Telegram configuration ----------
export const telegramSettings = pgTable('telegram_settings', {
  id: integer('id').primaryKey().default(1),
  chatId: text('chat_id'),
  reportTime: time('report_time').notNull().default('09:00'),
  dailyReportEnabled: boolean('daily_report_enabled').notNull().default(true),
  instantAlertsEnabled: boolean('instant_alerts_enabled').notNull().default(true),
  authorizedIds: jsonb('authorized_ids').$type<string[]>().notNull().default([]),
  webhookUrl: text('webhook_url'),
  lastReportAt: timestamp('last_report_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
});

// ---------- Sent daily reports archive ----------
export const dailyReports = pgTable(
  'daily_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportDate: date('report_date').notNull().unique(),
    stats: jsonb('stats').$type<Record<string, unknown>>().notNull(),
    message: text('message').notNull(),
    sent: boolean('sent').notNull().default(false),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => ({
    dateIdx: index('idx_reports_date').on(t.reportDate),
  }),
);

// ---------- System errors ----------
export const systemErrors = pgTable(
  'system_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ts: timestamp('ts', { withTimezone: true }).notNull().default(now()),
    service: text('service').notNull(), // instagram|openrouter|telegram|database|scheduler|web
    errorClass: text('error_class'),
    message: text('message').notNull(),
    context: jsonb('context').$type<Record<string, unknown>>(),
    resolved: boolean('resolved').notNull().default(false),
  },
  (t) => ({
    tsIdx: index('idx_errors_ts').on(t.ts),
    serviceIdx: index('idx_errors_service').on(t.service),
    resolvedIdx: index('idx_errors_resolved').on(t.resolved),
  }),
);

// ---------- Key-value app settings ----------
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
});

// ---------- Audit log (security) ----------
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ts: timestamp('ts', { withTimezone: true }).notNull().default(now()),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    ip: text('ip'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => ({
    tsIdx: index('idx_audit_ts').on(t.ts),
    userIdx: index('idx_audit_user').on(t.userId),
  }),
);
