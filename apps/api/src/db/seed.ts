// Idempotent seed: admin user (from env or first-run), default templates,
// telegram settings singleton. Safe to run multiple times.
import { db } from './client.js';
import { users, messageTemplates, telegramSettings } from './schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/crypto.js';
import { env } from '../env.js';
import { ensureDefaults } from '../lib/settings.js';
import {
  DEFAULT_COMMENT_TEMPLATES,
  DEFAULT_DM_TEMPLATES,
  DEFAULT_REPORT_TIME,
} from '@pc/shared';

async function main() {
  console.log('[seed] starting...');
  await ensureDefaults();

  // Telegram settings singleton
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

  // Admin user
  const existing = await db.select().from(users).limit(1);
  if (existing.length === 0 && env.adminPassword) {
    await db.insert(users).values({
      email: env.adminEmail.toLowerCase(),
      name: 'Mission Control',
      passwordHash: hashPassword(env.adminPassword),
      role: 'admin',
    });
    console.log(`[seed] admin user created: ${env.adminEmail}`);
  } else if (existing.length === 0) {
    console.log('[seed] no ADMIN_PASSWORD set — create your account from the login screen.');
  }

  // Default approved templates (Day 1..5 for DM + comment)
  for (const [day, content] of Object.entries(DEFAULT_DM_TEMPLATES)) {
    const dayNumber = Number(day);
    const [found] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.dayNumber, dayNumber))
      .limit(20);
    void found;
    await db
      .insert(messageTemplates)
      .values({
        name: `Day ${dayNumber} DM`,
        channel: 'dm',
        dayNumber,
        content,
        approved: true,
      })
      .onConflictDoNothing();
    await db
      .insert(messageTemplates)
      .values({
        name: `Day ${dayNumber} comment`,
        channel: 'comment',
        dayNumber,
        content: DEFAULT_COMMENT_TEMPLATES[dayNumber] ?? content,
        approved: true,
      })
      .onConflictDoNothing();
  }

  console.log('[seed] done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
