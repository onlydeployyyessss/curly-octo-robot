// ============================================================
// Telegram Bot API client + command/report orchestration.
// Commands are only accepted from the configured authorized
// chat(s). Daily reports and instant reply alerts.
// ============================================================
import { env } from '../env.js';
import { db } from '../db/client.js';
import { telegramSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { recordSystemError } from '../lib/audit.js';
import { buildDailyReport, buildReplyAlert } from './reports.js';
import { getDashboardStats } from './stats.js';
import { setAutomationGlobal, getLatestErrors } from './campaign-engine.js';

const API = 'https://api.telegram.org/bot';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string; first_name?: string };
    from: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
  };
}

async function tg(method: string, payload: Record<string, unknown>): Promise<any> {
  if (!env.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }
  if (env.mockExternal) {
    console.log(`[telegram:mock] ${method} =>`, JSON.stringify(payload).slice(0, 400));
    return { ok: true, mock: true };
  }
  let res: Response;
  try {
    res = await fetch(`${API}${env.telegramBotToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Telegram network error: ${(err as Error).message}`);
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(`Telegram API error ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  try {
    await tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err) {
    await recordSystemError('telegram', (err as Error).message, { errorClass: 'telegram_failure' });
    throw err;
  }
}

export async function setWebhook(url: string): Promise<void> {
  await tg('setWebhook', { url, allowed_updates: ['message'], drop_pending_updates: false });
}

export async function deleteWebhook(): Promise<void> {
  await tg('deleteWebhook', {});
}

async function getSettingsRow() {
  const [row] = await db
    .select()
    .from(telegramSettings)
    .where(eq(telegramSettings.id, 1))
    .limit(1);
  return row;
}

/** Is this chat/user allowed to control the bot? */
export async function isAuthorized(chatId: number, userId: number): Promise<boolean> {
  const row = await getSettingsRow();
  const allowed = new Set<string>([
    ...env.telegramAuthorizedIds,
    ...(row?.authorizedIds ?? []),
  ]);
  if (env.telegramChatId) allowed.add(String(env.telegramChatId));
  if (row?.chatId) allowed.add(String(row.chatId));
  return allowed.has(String(chatId)) || allowed.has(String(userId));
}

// ---------- Command handling ----------
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;
  const authed = await isAuthorized(msg.chat.id, msg.from?.id ?? 0);
  if (!authed) {
    await sendTelegramMessage(msg.chat.id, '⛔ Not authorized. Configure this chat id in PC Mission settings.').catch(() => {});
    return;
  }
  const text = msg.text.trim();
  const [cmd] = text.split(/\s+/);

  try {
    switch (cmd) {
      case '/start': {
        // Register this chat for reports if none set.
        const row = await getSettingsRow();
        if (row && !row.chatId) {
          await db.update(telegramSettings).set({ chatId: String(msg.chat.id), updatedAt: new Date() }).where(eq(telegramSettings.id, 1));
        }
        await sendTelegramMessage(
          msg.chat.id,
          `🤖 <b>PC MISSION</b>\n\nConnected. I'll send you a daily report and instant alerts when creators reply.\n\nCommands:\n/status — live snapshot\n/report — full daily report\n/creators — active campaigns\n/replies — latest replies\n/errors — recent errors\n/pause — STOP ALL AUTOMATION\n/resume — resume automation`,
        );
        break;
      }
      case '/status': {
        const s = await getDashboardStats();
        await sendTelegramMessage(
          msg.chat.id,
          `🤖 <b>PC MISSION</b>\n\nActive campaigns: ${s.activeCampaigns}\nToday's DMs: ${s.today.dms}\nToday's comments: ${s.today.comments}\nReplies: ${s.creatorReplies}\nPositive: ${s.positiveReplies}\nErrors: ${s.errors}\nAutomation: ${s.automationEnabled ? '🟢 ON' : '🛑 STOPPED'}`,
        );
        break;
      }
      case '/report': {
        const report = await buildDailyReport();
        await sendTelegramMessage(msg.chat.id, report.message);
        break;
      }
      case '/creators': {
        const s = await getDashboardStats();
        const lines = s.daysActive.map((d) => `• Day ${d.day}: ${d.count}`).join('\n') || '• No active campaigns yet';
        await sendTelegramMessage(
          msg.chat.id,
          `👥 <b>ACTIVE CAMPAIGNS</b>\n\nActive creators: ${s.activeCampaigns}\nCompleted: ${s.completedCampaigns}\n\n${lines}`,
        );
        break;
      }
      case '/replies': {
        const { getRecentReplies } = await import('./replies.js');
        const replies = await getRecentReplies(8);
        const body =
          replies.length === 0
            ? 'No replies yet.'
            : replies
                .map(
                  (r) =>
                    `👤 @${r.creatorUsername} — ${r.platform === 'dm' ? '📩 DM' : '💬 comment'} (${r.sentiment})\n"${r.text.slice(0, 140)}"`,
                )
                .join('\n\n');
        await sendTelegramMessage(msg.chat.id, `💬 <b>LATEST REPLIES</b>\n\n${body}`);
        break;
      }
      case '/errors': {
        const errs = await getLatestErrors(8);
        const body =
          errs.length === 0
            ? '✅ No recent errors.'
            : errs.map((e) => `• [${e.service}] ${e.message.slice(0, 120)}`).join('\n');
        await sendTelegramMessage(msg.chat.id, `⚠️ <b>RECENT ERRORS</b>\n\n${body}`);
        break;
      }
      case '/pause': {
        await setAutomationGlobal(false);
        await sendTelegramMessage(msg.chat.id, '🛑 <b>ALL AUTOMATION PAUSED</b>\n\nNo scheduled DMs or comments will be sent until you /resume.');
        break;
      }
      case '/resume': {
        await setAutomationGlobal(true);
        await sendTelegramMessage(msg.chat.id, '🟢 <b>AUTOMATION RESUMED</b>\n\nScheduled outreach is active again.');
        break;
      }
      default:
        await sendTelegramMessage(msg.chat.id, 'Unknown command. Try /status, /report, /creators, /replies, /errors, /pause, /resume.');
    }
  } catch (err) {
    await recordSystemError('telegram', `Command ${cmd} failed: ${(err as Error).message}`, {
      errorClass: 'telegram_failure',
    });
    await sendTelegramMessage(msg.chat.id, '⚠️ Something went wrong handling that command.').catch(() => {});
  }
}

// ---------- Long polling (Railway worker mode) ----------
let polling = false;
export async function startPolling(): Promise<void> {
  if (polling || !env.telegramBotToken || env.mockExternal) return;
  polling = true;
  let offset: number | undefined;
  console.log('[telegram] long-polling started');
  while (polling) {
    try {
      const res = await fetch(
        `${API}${env.telegramBotToken}/getUpdates?timeout=50${offset ? `&offset=${offset}` : ''}`,
      );
      const data: any = await res.json();
      if (data.ok) {
        for (const upd of data.result as TelegramUpdate[]) {
          offset = upd.update_id + 1;
          await handleUpdate(upd);
        }
      }
    } catch (err) {
      await recordSystemError('telegram', `Polling error: ${(err as Error).message}`, {
        errorClass: 'telegram_failure',
      });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function stopPolling(): void {
  polling = false;
}

export { buildDailyReport, buildReplyAlert };
