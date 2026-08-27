// ============================================================
// Lightweight in-memory rate limiter.
// (Single instance; behind Railway/Vercel scale-out use a Redis
// store — the middleware interface stays the same.)
// ============================================================
import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(windowMs: number, max: number, scope = 'app') {
  return (req: Request, res: Response, next: NextFunction) => {
    const id =
      (req.ip ?? 'unknown') +
      ':' +
      scope +
      ':' +
      (req.path?.split('/').slice(0, 3).join('/') ?? '');
    const now = Date.now();
    const b = buckets.get(id);
    if (!b || b.resetAt < now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (b.count >= max) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Slow down.' });
    }
    b.count += 1;
    next();
  };
}

// Periodically clean expired buckets.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref();
