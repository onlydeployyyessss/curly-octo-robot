// ============================================================
// PC Mission — zod validation schemas (shared client + server)
// ============================================================
import { z } from 'zod';
import { CAMPAIGN_STATUSES, RESPONSE_STATUSES } from './constants.js';

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const createCreatorSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(100)
    .regex(/^@?[A-Za-z0-9._]{1,30}$/, 'Invalid Instagram username'),
  profileUrl: z.string().url().max(300).optional().or(z.literal('')),
  igId: z.string().max(100).optional().or(z.literal('')),
  accountId: z.string().uuid().optional().nullable(),
  maxDays: z.number().int().min(1).max(30).optional(),
  dmEnabled: z.boolean().optional(),
  commentEnabled: z.boolean().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
  autoStart: z.boolean().optional(),
});
export type CreateCreatorInput = z.infer<typeof createCreatorSchema>;

export const updateCreatorSchema = z.object({
  notes: z.string().max(2000).optional(),
  accountId: z.string().uuid().nullable().optional(),
  dmEnabled: z.boolean().optional(),
  commentEnabled: z.boolean().optional(),
  maxDays: z.number().int().min(1).max(30).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  responseStatus: z.enum(RESPONSE_STATUSES).optional(),
});

export const campaignControlSchema = z.object({
  action: z.enum([
    'start',
    'pause',
    'resume',
    'stop',
    'skip_day',
    'restart',
    'exclude',
    'include',
  ]),
});

export const templateSchema = z.object({
  name: z.string().min(1).max(120),
  channel: z.enum(['dm', 'comment']),
  dayNumber: z.number().int().min(1).max(30).nullable().optional(),
  content: z.string().min(1, 'Message cannot be empty').max(1000),
  aiEnabled: z.boolean().optional(),
  approved: z.boolean().optional(),
});

export const bulkTemplatesSchema = z.object({
  templates: z
    .array(
      z.object({
        channel: z.enum(['dm', 'comment']),
        dayNumber: z.number().int().min(1).max(30),
        content: z.string().min(1).max(1000),
      }),
    )
    .min(1)
    .max(60),
});

export const generateMessageSchema = z.object({
  creatorId: z.string().uuid(),
  dayNumber: z.number().int().min(1).max(30).optional(),
  channel: z.enum(['dm', 'comment']).optional(),
});

export const sendTestSchema = z.object({
  accountId: z.string().uuid().optional().nullable(),
  message: z.string().min(1).max(1000),
  toTelegram: z.boolean().optional(),
});

export const telegramSettingsSchema = z.object({
  chatId: z.string().max(100).optional().or(z.literal('')),
  reportTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24-hour format')
    .optional(),
  dailyReportEnabled: z.boolean().optional(),
  instantAlertsEnabled: z.boolean().optional(),
  authorizedIds: z.array(z.string().max(100)).max(20).optional(),
});

export const appSettingsSchema = z.object({
  aiPersonalization: z.boolean().optional(),
  aiModel: z.string().max(100).optional(),
  automationEnabled: z.boolean().optional(),
  defaultMaxDays: z.number().int().min(1).max(30).optional(),
  defaultDmTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  autoApplyCampaign: z.boolean().optional(),
  stopOnReply: z.boolean().optional(),
  stopOnPositive: z.boolean().optional(),
  stopOnDecline: z.boolean().optional(),
  pcReceived: z.boolean().optional(),
});

export const campaignConfigSchema = z.object({
  maxDays: z.number().int().min(1).max(30),
  dmTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dmEnabled: z.boolean(),
  commentEnabled: z.boolean(),
  templates: z
    .array(
      z.object({
        dayNumber: z.number().int().min(1).max(30),
        dm: z.string().max(1000).default(''),
        comment: z.string().max(1000).default(''),
      }),
    )
    .min(1),
});
