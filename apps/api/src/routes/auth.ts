import { Router } from 'express';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { wrap, HttpError } from '../lib/http.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, setupSchema } from '@pc/shared';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  destroySession,
  requireAuth,
} from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { env } from '../env.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.get('/bootstrap', wrap(async (_req, res) => {
  const [u] = await db.select({ id: users.id }).from(users).limit(1);
  res.json({ needsSetup: !u, demoMode: env.mockExternal });
}));

authRouter.post(
  '/setup',
  validateBody(setupSchema),
  wrap(async (req, res) => {
    const [existing] = await db.select({ id: users.id }).from(users).limit(1);
    if (existing) throw new HttpError(409, 'Setup is already complete.');
    const [user] = await db
      .insert(users)
      .values({
        email: req.body.email.toLowerCase().trim(),
        name: req.body.name.trim(),
        passwordHash: hashPassword(req.body.password),
        role: 'admin',
      })
      .returning();
    const token = await createSession(user.id, { userAgent: req.headers['user-agent'], ip: req.ip });
    res.cookie(SESSION_COOKIE, token, cookieOpts());
    await audit(req, 'setup', 'user', user.id);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  wrap(async (req, res) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, req.body.email.toLowerCase()))
      .limit(1);
    if (!user || !verifyPassword(req.body.password, user.passwordHash)) {
      await audit(req, 'login_failed', 'user', user?.id);
      throw new HttpError(401, 'Invalid email or password');
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const token = await createSession(user.id, { userAgent: req.headers['user-agent'], ip: req.ip });
    res.cookie(SESSION_COOKIE, token, cookieOpts());
    await audit(req, 'login', 'user', user.id);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }),
);

authRouter.post('/logout', wrap(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await destroySession(token);
  res.clearCookie(SESSION_COOKIE);
  await audit(req, 'logout', 'user', req.user?.id);
  res.json({ ok: true });
}));

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProd,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}
