// Idempotent bootstrap data (no external env needed):
// telegram settings singleton + default approved templates.
import { db } from './client.js';
import { messageTemplates, telegramSettings } from './schema.js';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_COMMENT_TEMPLATES,
  DEFAULT_DM_TEMPLATES,
  DEFAULT_REPORT_TIME,
} from '@pc/shared';

let seeded = false;

export async function seedEssentials(): Promise<void> {
  if (seeded) return;
  seeded = true;
  await db
    .insert(telegramSettings)
    .values({
      id: 1,
      reportTime: DEFAULT_REPORT_TIME,
      dailyReportEnabled: true,
      instantAlertsEnabled: true,
      authorizedIds: [],
    })
    .onConflictDoNothing();

  for (const [dayStr, content] of Object.entries(DEFAULT_DM_TEMPLATES)) {
    const dayNumber = Number(dayStr);
    for (const channel of ['dm', 'comment'] as const) {
      const text = channel === 'dm' ? content : DEFAULT_COMMENT_TEMPLATES[dayNumber] ?? content;
      const existing = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.channel, channel));
      if (!existing.some((r) => r.dayNumber === dayNumber)) {
        await db
          .insert(messageTemplates)
          .values({ name: `Day ${dayNumber} ${channel}`, channel, dayNumber, content: text, approved: true })
          .onConflictDoNothing();
      }
    }
  }
}
