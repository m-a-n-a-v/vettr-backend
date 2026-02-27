import { Hono } from 'hono';
import { db } from '../config/database.js';
import { stocks } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { success } from '../utils/response.js';
import { NotFoundError, InternalError } from '../utils/errors.js';
import * as cache from '../services/cache.service.js';

const publicRoutes = new Hono();

const PUBLIC_CACHE_TTL = 15 * 60; // 15 minutes

/**
 * GET /public/stocks/:ticker
 * Public stock preview - no auth required.
 * Returns limited stock data for unauthenticated users.
 * Used for shareable stock pages and SEO.
 */
publicRoutes.get('/stocks/:ticker', async (c) => {
  if (!db) throw new InternalError('Database not available');

  const ticker = c.req.param('ticker').toUpperCase();

  const cacheKey = `public_stock:${ticker}`;
  const cached = await cache.get<any>(cacheKey);
  if (cached) {
    return c.json(success(cached), 200);
  }

  const result = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      name: stocks.name,
      exchange: stocks.exchange,
      sector: stocks.sector,
      marketCap: stocks.marketCap,
      price: stocks.price,
      priceChange: stocks.priceChange,
      vetrScore: stocks.vetrScore,
      updatedAt: stocks.updatedAt,
    })
    .from(stocks)
    .where(eq(stocks.ticker, ticker))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError(`Stock '${ticker}' not found`);
  }

  const stock = result[0]!;
  const dto = {
    ticker: stock.ticker,
    company_name: stock.name,
    exchange: stock.exchange,
    sector: stock.sector,
    market_cap: stock.marketCap,
    current_price: stock.price,
    price_change_percent: stock.priceChange,
    vetr_score: stock.vetrScore,
    last_updated: stock.updatedAt?.toISOString() ?? null,
    is_preview: true,
  };

  await cache.set(cacheKey, dto, PUBLIC_CACHE_TTL);

  return c.json(success(dto), 200);
});

export { publicRoutes };
