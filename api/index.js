// ============================================================
// Vercel Node.js Serverless Function entry.
//
// The real Express app is prebundled to _bundle/handler.cjs by
// the root build command (`npm run bundle:lambda`, see
// vercel.json). Bundling inlines the @pc/shared workspace package
// so the serverless build never depends on monorepo symlink
// resolution; npm dependencies stay external and are traced in.
//
// The require is a STATIC relative path so Vercel's file tracer
// includes _bundle/handler.cjs in the deployed function.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundled = require('./_bundle/handler.cjs');

const handler = bundled.default || bundled.handler || bundled;

module.exports = (req, res) =>
  Promise.resolve(handler(req, res)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[api] fatal:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
