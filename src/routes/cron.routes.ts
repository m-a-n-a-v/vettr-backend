import { Hono } from 'hono';
import { cronAuthMiddleware } from '../middleware/cron-auth.js';
import { refreshScoresChunk, refreshRedFlagsChunk, refreshAllChunked } from '../services/cron.service.js';
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
 * GET /cron/scores
 * Refreshes VETR scores for a chunk of stocks (default 100).
 * Uses Redis cursor 'cron:scores:offset' to track progress.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/scores', async (c) => {
  const result = await refreshScoresChunk();
  return c.json(success(result));
});

/**
 * GET /cron/red-flags
 * Refreshes red flags for a chunk of stocks (default 100).
 * Uses Redis cursor 'cron:red-flags:offset' to track progress.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/red-flags', async (c) => {
  const result = await refreshRedFlagsChunk();
  return c.json(success(result));
});

/**
 * GET /cron/refresh-all
 * Primary endpoint called by Vercel cron scheduler.
 * Refreshes both VETR scores and red flags in sequence.
 * Each job processes a chunk (~100 tickers) and tracks progress with Redis cursors.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/refresh-all', async (c) => {
  const result = await refreshAllChunked();
  return c.json(success(result));
});

/**
 * GET /cron/status
 * Returns current cron job progress including:
 * - Current offset for scores and red flags
 * - Total stock count
 * - Progress percentages
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/status', async (c) => {
  // Get current offsets from Redis
  const scoresOffset = (await cache.get<number>('cron:scores:offset')) || 0;
  const redFlagsOffset = (await cache.get<number>('cron:red-flags:offset')) || 0;

  // Query total stock count
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [{ value: totalStocks }] = await db
    .select({ value: count() })
    .from(stocks);

  // Calculate progress percentages
  const scoresProgressPct = totalStocks > 0
    ? Math.round((scoresOffset / totalStocks) * 100)
    : 0;
  const redFlagsProgressPct = totalStocks > 0
    ? Math.round((redFlagsOffset / totalStocks) * 100)
    : 0;

  return c.json(success({
    scores_offset: scoresOffset,
    red_flags_offset: redFlagsOffset,
    total_stocks: totalStocks,
    scores_progress_pct: scoresProgressPct,
    red_flags_progress_pct: redFlagsProgressPct,
  }));
});

/**
 * GET /cron/reset
 * Resets both Redis cursor keys to 0, forcing a full re-run from the beginning.
 * Useful for manual intervention or testing.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/reset', async (c) => {
  await cache.del('cron:scores:offset');
  await cache.del('cron:red-flags:offset');

  return c.json(success({
    message: 'Cron cursors reset',
  }));
});

/**
 * GET /cron/history
 * Returns the last 50 cron job execution history records.
 * Useful for monitoring job health and troubleshooting failures.
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
