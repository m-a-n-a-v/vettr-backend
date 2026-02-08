import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import { getStocks } from '../services/stock.service.js';
import { paginated } from '../utils/response.js';

const stockRoutes = new Hono();

// Apply auth middleware to all stock routes
stockRoutes.use('*', authMiddleware);

// Zod schema for GET /stocks query params
const getStocksQuerySchema = z.object({
  limit: z.string().optional().default('20'),
  offset: z.string().optional().default('0'),
  sector: z.string().optional(),
  exchange: z.string().optional(),
  sort: z.enum(['ticker', 'name', 'vetr_score', 'market_cap', 'price']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
});

// GET /stocks - List stocks with pagination, filtering, and sorting
stockRoutes.get('/', validateQuery(getStocksQuerySchema), async (c) => {
  const query = c.req.query();

  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

  const result = await getStocks({
    limit,
    offset,
    sector: query.sector,
    exchange: query.exchange,
    sort: query.sort as 'ticker' | 'name' | 'vetr_score' | 'market_cap' | 'price' | undefined,
    order: query.order as 'asc' | 'desc' | undefined,
    search: query.search,
  });

  // Map Drizzle camelCase fields to snake_case for API response
  const stockDtos = result.stocks.map((stock) => ({
    id: stock.id,
    ticker: stock.ticker,
    name: stock.name,
    exchange: stock.exchange,
    sector: stock.sector,
    market_cap: stock.marketCap,
    price: stock.price,
    price_change: stock.priceChange,
    vetr_score: stock.vetrScore,
    updated_at: stock.updatedAt.toISOString(),
  }));

  return c.json(paginated(stockDtos, result.pagination), 200);
});

export { stockRoutes };
