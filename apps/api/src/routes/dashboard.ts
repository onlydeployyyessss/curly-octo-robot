import { Router } from 'express';
import { wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { getDashboardStats } from '../services/stats.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/stats',
  wrap(async (_req, res) => {
    res.json({ stats: await getDashboardStats() });
  }),
);
