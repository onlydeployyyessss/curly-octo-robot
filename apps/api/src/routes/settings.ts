import { Router } from 'express';
import { wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { appSettingsSchema } from '@pc/shared';
import { requireAuth } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../lib/settings.js';
import { setAutomationGlobal } from '../services/campaign-engine.js';
import { audit } from '../lib/audit.js';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { desc } from 'drizzle-orm';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  wrap(async (_req, res) => {
    res.json({ settings: await getSettings() });
  }),
);

settingsRouter.put(
  '/',
  validateBody(appSettingsSchema),
  wrap(async (req, res) => {
    const patch = req.body;
    // Global automation switch is the emergency control.
    if (patch.automationEnabled !== undefined) {
      await setAutomationGlobal(patch.automationEnabled);
      delete patch.automationEnabled;
    }
    const settings = await updateSettings(patch);
    await audit(req, 'settings_updated', 'settings', undefined, patch);
    res.json({ settings });
  }),
);

// EMERGENCY: stop ALL automation immediately
settingsRouter.post(
  '/emergency-stop',
  wrap(async (req, res) => {
    await setAutomationGlobal(false);
    await audit(req, 'emergency_stop', 'settings');
    res.json({ ok: true, automationEnabled: false });
  }),
);

settingsRouter.get(
  '/audit',
  wrap(async (_req, res) => {
    const rows = await db
      .select({
        id: auditLogs.id,
        ts: auditLogs.ts,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        ip: auditLogs.ip,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.ts))
      .limit(100);
    res.json({ events: rows.map((r) => ({ ...r, ts: r.ts.toISOString() })) });
  }),
);
