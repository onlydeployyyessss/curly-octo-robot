// ============================================================
// Key-value app settings store with typed defaults.
// ============================================================
import { db } from '../db/client.js';
import { appSettings } from '../db/schema.js';
import { DEFAULT_DM_TIME, DEFAULT_MAX_DAYS } from '@pc/shared';
import { eq } from 'drizzle-orm';

export interface AppSettings {
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

const DEFAULTS: AppSettings = {
  aiPersonalization: false,
  aiModel: 'openai/gpt-4o-mini',
  automationEnabled: true,
  defaultMaxDays: DEFAULT_MAX_DAYS,
  defaultDmTime: DEFAULT_DM_TIME,
  autoApplyCampaign: true,
  stopOnReply: true,
  stopOnPositive: true,
  stopOnDecline: true,
  pcReceived: false,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...Object.fromEntries(map) } as AppSettings;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const s = await getSettings();
  return s[key];
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  for (const [k, v] of Object.entries(patch)) {
    await db
      .insert(appSettings)
      .values({ key: k, value: v })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: v, updatedAt: new Date() } });
  }
  return getSettings();
}

export async function ensureDefaults(): Promise<void> {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    await db
      .insert(appSettings)
      .values({ key: k, value: v })
      .onConflictDoNothing({ target: appSettings.key });
  }
  // Singleton telegram settings row
  await db
    .insert(appSettings)
    .values({ key: '__init__', value: true })
    .onConflictDoNothing();
  void eq; // keep import used in some builds
}
