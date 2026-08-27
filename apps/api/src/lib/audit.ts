import { db } from '../db/client.js';
import { auditLogs, systemErrors } from '../db/schema.js';
import type { Request } from 'express';

export async function audit(
  req: Request | null,
  action: string,
  entity?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await db.insert(auditLogs).values({
      userId: (req as unknown as { user?: { id: string } })?.user?.id ?? null,
      action,
      entity,
      entityId,
      ip: req?.ip,
      metadata,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', (err as Error).message);
  }
}

export async function recordSystemError(
  service: string,
  message: string,
  opts?: { errorClass?: string; context?: Record<string, unknown> },
) {
  // Never log secrets: callers pass already-scrubbed messages.
  console.error(`[error:${service}] ${message}`);
  try {
    await db.insert(systemErrors).values({
      service,
      errorClass: opts?.errorClass ?? null,
      message: message.slice(0, 2000),
      context: opts?.context ?? null,
    });
  } catch (err) {
    console.error('[system_errors] failed to record error:', (err as Error).message);
  }
}
