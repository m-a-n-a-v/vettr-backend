import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { getPulseSummary } from '../services/pulse.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const pulseRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all pulse routes
pulseRoutes.use('*', authMiddleware);

/**
 * GET /pulse/summary
 * Returns aggregated pulse dashboard data for the authenticated user's watchlist.
 * Includes watchlist health, sector exposure, and red flag categories.
 * Cached for 5 minutes per user.
 */
pulseRoutes.get('/summary', async (c) => {
  const user = c.get('user');
  const summary = await getPulseSummary(user.id);
  return c.json(success(summary), 200);
});

export { pulseRoutes };
