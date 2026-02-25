import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { getFundamentals } from '../services/fundamentals.service.js';
import { success } from '../utils/response.js';
import type { AuthUser } from '../middleware/auth.js';

type Variables = {
  requestId: string;
  user: AuthUser;
};

const fundamentalsRoutes = new Hono<{ Variables: Variables }>();

fundamentalsRoutes.use('*', authMiddleware);

/**
 * GET /:ticker/fundamentals
 * Returns comprehensive fundamentals data for a stock, assembled from 16 database tables.
 */
fundamentalsRoutes.get('/:ticker/fundamentals', async (c) => {
  const ticker = c.req.param('ticker');
  const data = await getFundamentals(ticker);
  return c.json(success(data), 200);
});

export { fundamentalsRoutes };
