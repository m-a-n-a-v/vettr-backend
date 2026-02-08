import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { getLatestFilings, getFilingById, markAsRead } from '../services/filing.service.js';
import { paginated, success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const filingRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all filing routes
filingRoutes.use('*', authMiddleware);

// Zod schema for GET /filings query params
const getFilingsQuerySchema = z.object({
  limit: z.string().optional().default('20'),
  offset: z.string().optional().default('0'),
});

// GET /filings - List latest filings across all stocks with pagination
filingRoutes.get('/', validateQuery(getFilingsQuerySchema), async (c) => {
  const query = c.req.query();

  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

  const result = await getLatestFilings({ limit, offset });

  // Map Drizzle camelCase fields to snake_case for API response
  const filingDtos = result.filings.map((item) => ({
    id: item.filing.id,
    stock_id: item.filing.stockId,
    type: item.filing.type,
    title: item.filing.title,
    date: item.filing.date.toISOString(),
    summary: item.filing.summary,
    is_material: item.filing.isMaterial,
    source_url: item.filing.sourceUrl,
    created_at: item.filing.createdAt.toISOString(),
    stock_ticker: item.stock_ticker,
    stock_name: item.stock_name,
  }));

  return c.json(paginated(filingDtos, result.pagination), 200);
});

// GET /filings/:id - Get filing detail with per-user is_read status
filingRoutes.get('/:id', async (c) => {
  const filingId = c.req.param('id');
  const user = c.get('user');

  const result = await getFilingById(filingId, user.id);

  const filingDto = {
    id: result.filing.id,
    stock_id: result.filing.stockId,
    type: result.filing.type,
    title: result.filing.title,
    date: result.filing.date.toISOString(),
    summary: result.filing.summary,
    is_material: result.filing.isMaterial,
    source_url: result.filing.sourceUrl,
    created_at: result.filing.createdAt.toISOString(),
    is_read: result.is_read,
  };

  return c.json(success(filingDto), 200);
});

// POST /filings/:id/read - Mark filing as read for the current user
filingRoutes.post('/:id/read', async (c) => {
  const filingId = c.req.param('id');
  const user = c.get('user');

  await markAsRead(filingId, user.id);

  return c.json(success({ filing_id: filingId, is_read: true }), 200);
});

export { filingRoutes };
