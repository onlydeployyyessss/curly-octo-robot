// Registers the Telegram webhook (Vercel deployment).
// Usage: npm run telegram:webhook -- https://your-app.vercel.app
import 'dotenv/config';
import { env } from '../env.js';
import { setWebhook, deleteWebhook } from '../services/telegram.js';

async function main() {
  const url = process.argv[2];
  if (!env.telegramBotToken) {
    console.error('TELEGRAM_BOT_TOKEN is not set.');
    process.exit(1);
  }
  if (!url) {
    await deleteWebhook();
    console.log('Webhook deleted (use long polling in worker mode).');
    return;
  }
  await setWebhook(url.replace(/\/$/, '') + '/api/telegram/webhook');
  console.log('Webhook set to:', url.replace(/\/$/, '') + '/api/telegram/webhook');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
