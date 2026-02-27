import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  getNewsArticles,
  getMaterialNews,
  getNewsForTickers,
  getUpcomingFilings,
  getOverdueFilings,
} from '../services/news.service.js';
import { success, paginated } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const newsRoutes = new Hono<{ Variables: Variables }>();

// Public routes - no auth required for reading news/filings
// Only /news/portfolio requires auth (uses user's portfolio tickers)
newsRoutes.get('/portfolio', authMiddleware, async (c) => {
  const tickersParam = c.req.query('tickers') ?? '';
  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const items = await getNewsForTickers(tickers);
  return c.json(success(items), 200);
});

/**
 * GET /news
 * List news articles with optional filters (PUBLIC)
 * Query params: source, ticker, limit, offset
 */
newsRoutes.get('/', async (c) => {
  const source = c.req.query('source');
  const ticker = c.req.query('ticker');
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const { items, total } = await getNewsArticles({ source, ticker, limit, offset });

  return c.json(paginated(items, {
    total,
    limit,
    offset,
    has_more: offset + limit < total,
  }), 200);
});

/**
 * GET /news/material
 * Get material news (flagged as significant)
 */
newsRoutes.get('/material', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '10', 10);
  const items = await getMaterialNews(limit);
  return c.json(success(items), 200);
});

/**
 * GET /news/filings
 * Get upcoming filing calendar
 * Query params: ticker, status, days, limit
 */
newsRoutes.get('/filings', async (c) => {
  const ticker = c.req.query('ticker');
  const status = c.req.query('status');
  const days = c.req.query('days') ? parseInt(c.req.query('days')!, 10) : undefined;
  const limit = parseInt(c.req.query('limit') ?? '20', 10);

  const items = await getUpcomingFilings({ ticker, status, days, limit });
  return c.json(success(items), 200);
});

/**
 * GET /news/filings/overdue
 * Get overdue filings
 */
newsRoutes.get('/filings/overdue', async (c) => {
  const items = await getOverdueFilings();
  return c.json(success(items), 200);
});

export { newsRoutes };
