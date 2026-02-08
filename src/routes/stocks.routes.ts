import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { getStocks, getStockByTicker, searchStocks } from '../services/stock.service.js';
import { getFilingsByStock } from '../services/filing.service.js';
import { paginated, success } from '../utils/response.js';
import { NotFoundError, InternalError } from '../utils/errors.js';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks } from '../db/schema/index.js';

type Variables = {
  user: AuthUser;
};

const stockRoutes = new Hono<{ Variables: Variables }>();

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

// Zod schema for GET /stocks/search query params
const searchStocksQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.string().optional().default('10'),
});

// GET /stocks/search - Search stocks by name or ticker with caching
stockRoutes.get('/search', validateQuery(searchStocksQuerySchema), async (c) => {
  const query = c.req.query();

  const q = query.q!;
  const limit = Math.min(Math.max(parseInt(query.limit || '10', 10) || 10, 1), 50);

  const results = await searchStocks(q, limit);

  const stockDtos = results.map((stock) => ({
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

  return c.json(success(stockDtos), 200);
});

// Zod schema for GET /stocks/:ticker/filings query params
const getStockFilingsQuerySchema = z.object({
  limit: z.string().optional().default('20'),
  offset: z.string().optional().default('0'),
  type: z.string().optional(),
});

// GET /stocks/:ticker/filings - Get filings for a specific stock
stockRoutes.get('/:ticker/filings', validateQuery(getStockFilingsQuerySchema), async (c) => {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const ticker = c.req.param('ticker');

  // Resolve ticker to stock record
  const stockResults = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  const stock = stockResults[0];
  if (!stock) {
    throw new NotFoundError(`Stock with ticker '${ticker}' not found`);
  }

  const query = c.req.query();
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

  const result = await getFilingsByStock(stock.id, { limit, offset, type: query.type });

  const filingDtos = result.filings.map((filing) => ({
    id: filing.id,
    stock_id: filing.stockId,
    type: filing.type,
    title: filing.title,
    date: filing.date.toISOString(),
    summary: filing.summary,
    is_material: filing.isMaterial,
    source_url: filing.sourceUrl,
    created_at: filing.createdAt.toISOString(),
  }));

  return c.json(paginated(filingDtos, result.pagination), 200);
});

// GET /stocks/:ticker - Get stock detail with executives summary, recent filings, and watchlist status
stockRoutes.get('/:ticker', async (c) => {
  const ticker = c.req.param('ticker');
  const user = c.get('user');

  const detail = await getStockByTicker(ticker, user.id);

  const stockDto = {
    id: detail.stock.id,
    ticker: detail.stock.ticker,
    name: detail.stock.name,
    exchange: detail.stock.exchange,
    sector: detail.stock.sector,
    market_cap: detail.stock.marketCap,
    price: detail.stock.price,
    price_change: detail.stock.priceChange,
    vetr_score: detail.stock.vetrScore,
    updated_at: detail.stock.updatedAt.toISOString(),
  };

  const executivesDtos = detail.executives_summary.top.map((exec) => ({
    id: exec.id,
    name: exec.name,
    title: exec.title,
    years_at_company: exec.yearsAtCompany,
    previous_companies: exec.previousCompanies,
    education: exec.education,
    specialization: exec.specialization,
    social_linkedin: exec.socialLinkedin,
    social_twitter: exec.socialTwitter,
  }));

  const filingsDtos = detail.recent_filings.map((filing) => ({
    id: filing.id,
    stock_id: filing.stockId,
    type: filing.type,
    title: filing.title,
    date: filing.date.toISOString(),
    summary: filing.summary,
    is_material: filing.isMaterial,
    source_url: filing.sourceUrl,
    created_at: filing.createdAt.toISOString(),
  }));

  return c.json(success({
    ...stockDto,
    executives_summary: {
      total: detail.executives_summary.total,
      top: executivesDtos,
    },
    recent_filings: filingsDtos,
    is_favorite: detail.is_favorite,
  }), 200);
});

export { stockRoutes };
