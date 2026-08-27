// Vercel serverless entry — exports the Express app as default.
// DB migrations run at deploy time (vercel build script) and are
// idempotent; here we just make sure seed defaults exist.
import { createApp } from './server.js';
import { ensureDefaults } from './lib/settings.js';

let initialized = false;
async function init() {
  if (initialized) return;
  try {
    await ensureDefaults();
    initialized = true;
  } catch (err) {
    console.error('[api] init failed:', (err as Error).message);
  }
}

const app = createApp();
const originalHandle = app;

const handler = async (req: any, res: any) => {
  await init();
  return originalHandle(req, res);
};

export default handler;
