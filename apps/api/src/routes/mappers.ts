// Row -> DTO mappers (camelCase API shape).
import type {
  CreatorDTO,
  InstagramAccountDTO,
  CampaignDTO,
  CampaignDayDTO,
  ActivityEventDTO,
} from '@pc/shared';

const iso = (d: Date | string | null | undefined): string | null =>
  d ? (d instanceof Date ? d.toISOString() : String(d)) : null;

export function toAccountDTO(r: Record<string, any>, extras: Partial<InstagramAccountDTO> = {}): InstagramAccountDTO {
  return {
    id: r.id,
    username: r.username ?? null,
    igUserId: r.igUserId ?? null,
    status: r.status,
    accountType: r.accountType ?? null,
    scopes: r.scopes ?? null,
    tokenExpiresAt: iso(r.tokenExpiresAt),
    activeCampaigns: extras.activeCampaigns ?? 0,
    todayActions: extras.todayActions ?? 0,
    errors: r.errorCount ?? 0,
    lastSuccessAt: iso(r.lastSuccessAt),
    lastError: r.lastError ?? null,
    createdAt: iso(r.createdAt) ?? new Date().toISOString(),
  };
}

export function toCreatorDTO(r: Record<string, any>): CreatorDTO {
  let nextAction: string | null = null;
  if (r.excluded) nextAction = 'Excluded';
  else if (r.responseStatus && r.responseStatus !== 'none') nextAction = 'Automation paused — replied';
  else if (r.status === 'completed') nextAction = 'Completed';
  else if (r.status === 'stopped') nextAction = 'Stopped';
  else if (r.status === 'paused') nextAction = 'Paused';
  else if (r.status === 'active') nextAction = r.dmEnabled ? `Day ${(r.currentDay ?? 0) + 1} DM scheduled` : 'Comment follow-up';
  else nextAction = 'Start campaign';

  return {
    id: r.id,
    username: r.username,
    profileUrl: r.profileUrl ?? null,
    igId: r.igId ?? null,
    accountId: r.accountId ?? null,
    accountUsername: r.accountUsername ?? null,
    status: r.status,
    responseStatus: r.responseStatus,
    startDate: r.startDate ? (r.startDate instanceof Date ? r.startDate.toISOString().slice(0, 10) : String(r.startDate)) : null,
    currentDay: r.currentDay ?? 0,
    maxDays: r.maxDays ?? 5,
    dmEnabled: r.dmEnabled,
    commentEnabled: r.commentEnabled,
    notes: r.notes ?? null,
    excluded: r.excluded,
    lastInteractionAt: iso(r.lastInteractionAt),
    lastDmAt: iso(r.lastDmAt),
    lastCommentAt: iso(r.lastCommentAt),
    lastResponseAt: iso(r.lastResponseAt),
    nextAction,
    createdAt: iso(r.createdAt) ?? new Date().toISOString(),
  };
}

export function toDayDTO(r: Record<string, any>): CampaignDayDTO {
  let status: CampaignDayDTO['status'] = r.status;
  if (r.dmSentAt && r.commentSentAt) status = 'sent';
  else if (r.dmSentAt || r.commentSentAt) status = 'partial';
  return {
    id: r.id,
    dayNumber: r.dayNumber,
    dmContent: r.dmContent ?? null,
    commentContent: r.commentContent ?? null,
    dmEnabled: r.dmEnabled,
    commentEnabled: r.commentEnabled,
    dmSentAt: iso(r.dmSentAt),
    commentSentAt: iso(r.commentSentAt),
    status,
  };
}

export function toCampaignDTO(r: Record<string, any>, days: Record<string, any>[] = []): CampaignDTO {
  return {
    id: r.id,
    creatorId: r.creatorId,
    creatorUsername: r.creatorUsername ?? '',
    accountId: r.accountId ?? null,
    accountUsername: r.accountUsername ?? null,
    status: r.status,
    currentDay: r.currentDay ?? 0,
    maxDays: r.maxDays ?? 5,
    dmEnabled: r.dmEnabled,
    commentEnabled: r.commentEnabled,
    startedAt: iso(r.startedAt),
    completedAt: iso(r.completedAt),
    pausedAt: iso(r.pausedAt),
    stoppedAt: iso(r.stoppedAt),
    days: days.map(toDayDTO).sort((a, b) => a.dayNumber - b.dayNumber),
  };
}

export function toActivityDTO(r: Record<string, any>): ActivityEventDTO {
  return {
    id: r.id,
    ts: iso(r.ts) ?? new Date().toISOString(),
    creatorUsername: r.creatorUsername ?? null,
    accountUsername: r.accountUsername ?? null,
    actionType: r.actionType,
    campaignDay: r.campaignDay ?? null,
    content: r.content ?? null,
    status: r.status,
    errorMessage: r.errorMessage ?? null,
    metadata: r.metadata ?? null,
  };
}
