import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { calculateVetrScore, getScoreHistory, getScoreTrend, getScoreComparison } from '../services/vetr-score.service.js';
import { getSnapshotsForTicker } from '../services/snapshot.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const vetrScoreRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all vetr-score routes
vetrScoreRoutes.use('*', authMiddleware);

// Zod schema for GET /stocks/:ticker/vetr-score/history query params
const historyQuerySchema = z.object({
  months: z.string().optional().default('6'),
});

// Zod schema for GET /stocks/:ticker/vetr-score/chart query params
const chartQuerySchema = z.object({
  range: z.string().optional().default('7d'),
});

// GET /stocks/:ticker/vetr-score/chart - Return score time-series data for charting
vetrScoreRoutes.get('/:ticker/vetr-score/chart', validateQuery(chartQuerySchema), async (c) => {
  const ticker = c.req.param('ticker');
  const query = c.req.query();

  // Validate and normalize range parameter
  const allowedRanges = ['24h', '7d', '30d', '90d'] as const;
  type Range = typeof allowedRanges[number];
  const range: Range = (allowedRanges.includes(query.range as Range) ? query.range : '7d') as Range;

  const upperTicker = ticker.toUpperCase();
  const snapshots = await getSnapshotsForTicker(upperTicker, range);

  return c.json(success({
    ticker: upperTicker,
    range,
    data_points: snapshots.length,
    snapshots: snapshots.map(s => ({
      overall_score: s.overall_score,
      financial_survival_score: s.financial_survival_score,
      operational_efficiency_score: s.operational_efficiency_score,
      shareholder_structure_score: s.shareholder_structure_score,
      market_sentiment_score: s.market_sentiment_score,
      price: s.price,
      recorded_at: s.recorded_at,
    })),
  }), 200);
});

// GET /stocks/:ticker/vetr-score/history - Return score history from DB
vetrScoreRoutes.get('/:ticker/vetr-score/history', validateQuery(historyQuerySchema), async (c) => {
  const ticker = c.req.param('ticker');
  const query = c.req.query();

  const months = Math.min(Math.max(parseInt(query.months || '6', 10) || 6, 1), 24);

  const history = await getScoreHistory(ticker, months);

  return c.json(success(history), 200);
});

// GET /stocks/:ticker/vetr-score/trend - Calculate trend direction, momentum, and score changes
vetrScoreRoutes.get('/:ticker/vetr-score/trend', async (c) => {
  const ticker = c.req.param('ticker');

  const trend = await getScoreTrend(ticker);

  return c.json(success(trend), 200);
});

// GET /stocks/:ticker/vetr-score/compare - Sector peer comparison with percentile rank
vetrScoreRoutes.get('/:ticker/vetr-score/compare', async (c) => {
  const ticker = c.req.param('ticker');

  const comparison = await getScoreComparison(ticker);

  return c.json(success(comparison), 200);
});

// GET /stocks/:ticker/vetr-score - Return current score with all component breakdowns
vetrScoreRoutes.get('/:ticker/vetr-score', async (c) => {
  const ticker = c.req.param('ticker');

  // Calculate or return cached score
  const score = await calculateVetrScore(ticker);

  return c.json(success(score), 200);
});

export { vetrScoreRoutes };
