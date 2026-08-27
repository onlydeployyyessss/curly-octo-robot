// ============================================================
// Environment configuration — all secrets read server-side only.
// ============================================================
import 'dotenv/config';

function req(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const env = {
  nodeEnv: req('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(req('PORT', '4000'), 10),
  appUrl: req('APP_URL', 'http://localhost:5173'),

  databaseUrl: req(
    'DATABASE_URL',
    'postgresql://pc:pc@localhost:5432/pc_mission',
  ),

  sessionSecret: req('SESSION_SECRET', 'dev-session-secret-change-me-0123456789'),
  adminEmail: req('ADMIN_EMAIL', 'admin@pcmission.app'),
  adminPassword: req('ADMIN_PASSWORD', ''),

  openrouterApiKey: req('OPENROUTER_API_KEY'),
  openrouterModel: req('OPENROUTER_MODEL', 'openai/gpt-4o-mini'),
  openrouterSiteUrl: req('OPENROUTER_SITE_URL', ''),

  telegramBotToken: req('TELEGRAM_BOT_TOKEN'),
  telegramChatId: req('TELEGRAM_CHAT_ID'),
  telegramAuthorizedIds: req('TELEGRAM_AUTHORIZED_IDS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  metaAppId: req('META_APP_ID'),
  metaAppSecret: req('META_APP_SECRET'),
  metaRedirectUri: req('META_REDIRECT_URI', `${req('APP_URL', 'http://localhost:5173')}/api/instagram/callback`),
  metaGraphVersion: req('META_GRAPH_VERSION', 'v21.0'),
  metaWebhookVerify: req('META_WEBHOOK_VERIFY'),
  metaWebhookSecret: req('META_WEBHOOK_SECRET'),

  cronSecret: req('CRON_SECRET', 'dev-cron-secret'),
  runWorker: req('RUN_WORKER', 'false') === 'true',

  // When true (local dev / tests), external APIs (Meta/OpenRouter/Telegram)
  // are simulated so the full campaign flow can be exercised safely.
  mockExternal: req('MOCK_EXTERNAL', 'true') === 'true',
};

export function assertEncryptionKey(): string {
  // SESSION_SECRET doubles as the at-rest encryption key for OAuth tokens.
  const key = env.sessionSecret;
  if (key.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters long');
  }
  return key;
}
