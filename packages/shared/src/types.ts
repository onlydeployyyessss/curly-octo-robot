// ============================================================
// PC Mission — shared API/DTO types
// ============================================================
import type {
  CampaignStatus,
  ResponseStatus,
  ScheduledActionType,
} from './constants.js';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface InstagramAccountDTO {
  id: string;
  username: string | null;
  igUserId: string | null;
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  accountType: string | null;
  scopes: string | null;
  tokenExpiresAt: string | null;
  activeCampaigns: number;
  todayActions: number;
  errors: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface CreatorDTO {
  id: string;
  username: string;
  profileUrl: string | null;
  igId: string | null;
  accountId: string | null;
  accountUsername: string | null;
  status: CampaignStatus;
  responseStatus: ResponseStatus;
  startDate: string | null;
  currentDay: number;
  maxDays: number;
  dmEnabled: boolean;
  commentEnabled: boolean;
  notes: string | null;
  excluded: boolean;
  lastInteractionAt: string | null;
  lastDmAt: string | null;
  lastCommentAt: string | null;
  lastResponseAt: string | null;
  nextAction: string | null;
  createdAt: string;
}

export interface CampaignDTO {
  id: string;
  creatorId: string;
  creatorUsername: string;
  accountId: string | null;
  accountUsername: string | null;
  status: CampaignStatus;
  currentDay: number;
  maxDays: number;
  dmEnabled: boolean;
  commentEnabled: boolean;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  stoppedAt: string | null;
  days: CampaignDayDTO[];
}

export interface CampaignDayDTO {
  id: string;
  dayNumber: number;
  dmContent: string | null;
  commentContent: string | null;
  dmEnabled: boolean;
  commentEnabled: boolean;
  dmSentAt: string | null;
  commentSentAt: string | null;
  status: 'pending' | 'sent' | 'partial' | 'skipped' | 'failed';
}

export interface TemplateDTO {
  id: string;
  name: string;
  channel: 'dm' | 'comment';
  dayNumber: number | null;
  content: string;
  aiEnabled: boolean;
  approved: boolean;
}

export interface ActivityEventDTO {
  id: string;
  ts: string;
  creatorUsername: string | null;
  accountUsername: string | null;
  actionType: string;
  campaignDay: number | null;
  content: string | null;
  status: 'success' | 'failed' | 'info';
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ReplyDTO {
  id: string;
  creatorId: string;
  creatorUsername: string;
  accountUsername: string | null;
  platform: 'dm' | 'comment';
  text: string;
  ourText: string | null;
  mediaRef: string | null;
  sentiment: ResponseStatus;
  ts: string;
  notified: boolean;
}

export interface ScheduledActionDTO {
  id: string;
  idempotencyKey: string;
  type: ScheduledActionType;
  creatorUsername: string | null;
  campaignDay: number | null;
  scheduledAt: string;
  status: string;
  attempts: number;
  lastError: string | null;
}

export interface DashboardStats {
  totalCreators: number;
  activeCampaigns: number;
  completedCampaigns: number;
  dmsSent: number;
  commentsSent: number;
  creatorReplies: number;
  positiveReplies: number;
  declines: number;
  errors: number;
  currentCampaigns: { status: string; count: number }[];
  daysActive: { day: number; count: number }[];
  today: {
    dms: number;
    comments: number;
    replies: number;
    errors: number;
    newCreators: number;
  };
  pcReceived: boolean;
  positiveOpportunities: number;
  automationEnabled: boolean;
}

export interface TelegramSettingsDTO {
  chatId: string | null;
  reportTime: string;
  dailyReportEnabled: boolean;
  instantAlertsEnabled: boolean;
  authorizedIds: string[];
  lastReportAt: string | null;
  botConfigured: boolean;
}

export interface AppSettingsDTO {
  aiPersonalization: boolean;
  aiModel: string;
  automationEnabled: boolean;
  defaultMaxDays: number;
  defaultDmTime: string;
  autoApplyCampaign: boolean;
  stopOnReply: boolean;
  stopOnPositive: boolean;
  stopOnDecline: boolean;
  pcReceived: boolean;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
