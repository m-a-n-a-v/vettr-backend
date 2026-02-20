import { Hono } from 'hono';
import { cronAuthMiddleware } from '../middleware/cron-auth.js';
import { refreshMarketDataChunk, refreshScoresChunk, refreshRedFlagsChunk } from '../services/cron.service.js';
import { success } from '../utils/response.js';
import * as cache from '../services/cache.service.js';
import { db } from '../config/database.js';
import { stocks, cronJobRuns } from '../db/schema/index.js';
import { count, desc } from 'drizzle-orm';
import { InternalError } from '../utils/errors.js';

const cronRoutes = new Hono();

// Apply cron auth middleware to all cron routes
cronRoutes.use('*', cronAuthMiddleware);

/**
 * GET /cron/market-data
 * Fetches fresh prices, financials, and volume from Yahoo Finance.
 * Updates stocks + financial_data tables.
 * Runs at :00 every 2 hours. 1000 tickers per chunk.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/market-data', async (c) => {
  const result = await refreshMarketDataChunk();
  return c.json(success(result));
});

/**
 * GET /cron/scores
 * Refreshes VETR scores for a chunk of stocks (default 1000).
 * Runs at :20 every 2 hours (after market data is updated).
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/scores', async (c) => {
  const result = await refreshScoresChunk();
  return c.json(success(result));
});

/**
 * GET /cron/red-flags
 * Refreshes red flags for a chunk of stocks (default 1000).
 * Runs at :40 every 2 hours (after scores are updated).
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/red-flags', async (c) => {
  const result = await refreshRedFlagsChunk();
  return c.json(success(result));
});

/**
 * GET /cron/status
 * Returns current cron job progress for all 3 jobs.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/status', async (c) => {
  const marketDataOffset = (await cache.get<number>('cron:market-data:offset')) || 0;
  const scoresOffset = (await cache.get<number>('cron:scores:offset')) || 0;
  const redFlagsOffset = (await cache.get<number>('cron:red-flags:offset')) || 0;

  if (!db) {
    throw new InternalError('Database not available');
  }

  const [{ value: totalStocks }] = await db
    .select({ value: count() })
    .from(stocks);

  const pct = (offset: number) => totalStocks > 0
    ? Math.round((offset / totalStocks) * 100)
    : 0;

  return c.json(success({
    market_data_offset: marketDataOffset,
    scores_offset: scoresOffset,
    red_flags_offset: redFlagsOffset,
    total_stocks: totalStocks,
    market_data_progress_pct: pct(marketDataOffset),
    scores_progress_pct: pct(scoresOffset),
    red_flags_progress_pct: pct(redFlagsOffset),
  }));
});

/**
 * GET /cron/reset
 * Resets all Redis cursor keys to 0, forcing a full re-run from the beginning.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/reset', async (c) => {
  await cache.del('cron:market-data:offset');
  await cache.del('cron:scores:offset');
  await cache.del('cron:red-flags:offset');

  return c.json(success({
    message: 'All cron cursors reset',
  }));
});

/**
 * GET /cron/history
 * Returns the last 50 cron job execution history records.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/history', async (c) => {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const history = await db
    .select()
    .from(cronJobRuns)
    .orderBy(desc(cronJobRuns.startedAt))
    .limit(50);

  return c.json(success({
    runs: history,
    total: history.length,
  }));
});

export { cronRoutes };
