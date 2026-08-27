// ============================================================
// Telegram delivery with settings gating (instant alerts vs daily
// reports) and graceful failure recording.
// ============================================================
import { db } from '../db/client.js';
import { telegramSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { sendTelegramMessage } from './telegram.js';
import { recordSystemError } from '../lib/audit.js';

export async function resolveChatId(): Promise<string | null> {
  const [row] = await db.select().from(telegramSettings).where(eq(telegramSettings.id, 1)).limit(1);
  return row?.chatId || env.telegramChatId || null;
}

export async function sendTelegramIfEnabled(
  message: string,
  opts: { instantOnly?: boolean; reportOnly?: boolean } = {},
): Promise<boolean> {
  const [row] = await db.select().from(telegramSettings).where(eq(telegramSettings.id, 1)).limit(1);
  const chatId = row?.chatId || env.telegramChatId;
  if (!chatId) return false;

  if (opts.instantOnly && row && row.instantAlertsEnabled === false) return false;
  if (opts.reportOnly && row && row.dailyReportEnabled === false) return false;

  try {
    await sendTelegramMessage(chatId, message);
    return true;
  } catch (err) {
    await recordSystemError('telegram', (err as Error).message, { errorClass: 'telegram_failure' });
    return false;
  }
}
