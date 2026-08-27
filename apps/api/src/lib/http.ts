import type { NextFunction, Request, Response } from 'express';
import type { ErrorClass } from '@pc/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Error carrying a classification used by the scheduler retry policy. */
export class ExternalApiError extends Error {
  constructor(
    public errorClass: ErrorClass,
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function isValidUsername(u: string): boolean {
  return /^@?[A-Za-z0-9._]{1,30}$/.test(u);
}

export function normalizeUsername(u: string): string {
  return u.trim().replace(/^@/, '').toLowerCase();
}
