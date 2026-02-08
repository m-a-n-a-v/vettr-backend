import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { getLatestFilings } from '../services/filing.service.js';
import { paginated } from '../utils/response.js';

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

export { filingRoutes };
