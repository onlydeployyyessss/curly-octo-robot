// ============================================================
// Session cookie authentication.
// Cookie: HttpOnly, SameSite=Lax, Secure in production.
// ============================================================
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { HttpError } from '../lib/http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string; role: string };
    }
  }
}

export const SESSION_COOKIE = 'pc_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string }): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new HttpError(401, 'Not authenticated');
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!session) throw new HttpError(401, 'Session expired');
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user) throw new HttpError(401, 'User not found');
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

/** Cron/w webhook bearer auth. */
export function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const secret = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!secret || secret !== process.env.CRON_SECRET) {
    next(new HttpError(403, 'Forbidden'));
    return;
  }
  next();
}
