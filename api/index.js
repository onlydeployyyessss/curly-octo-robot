// ============================================================
// Vercel Node.js Serverless Function entry.
//
// The real Express app is prebundled to _bundle/handler.cjs by
// the root build command (`npm run bundle:lambda`, see
// vercel.json). Bundling inlines the @pc/shared workspace package
// so the serverless build never depends on monorepo symlink
// resolution; npm dependencies stay external and are traced in.
// ============================================================
const path = require('path');

function load() {
  // eslint-disable-next-line global-require
  return require(path.join(__dirname, '_bundle', 'handler.cjs'));
}

module.exports = (req, res) => {
  const mod = load();
  const handler = mod.default || mod.handler || mod;
  return Promise.resolve(handler(req, res)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[api] fatal:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
};
