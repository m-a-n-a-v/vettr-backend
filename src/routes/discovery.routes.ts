import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { getCollections } from '../services/discovery.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const discoveryRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all discovery routes
discoveryRoutes.use('*', authMiddleware);

// GET /discovery/collections - Get all curated collections
discoveryRoutes.get('/collections', async (c) => {
  const result = await getCollections();
  return c.json(success(result), 200);
});

export { discoveryRoutes };
