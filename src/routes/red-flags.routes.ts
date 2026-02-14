import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  detectRedFlags,
  getRedFlagHistoryForStock,
  getGlobalRedFlagHistory,
  acknowledgeRedFlag,
  acknowledgeAllForStock,
  getRedFlagTrend,
} from '../services/red-flag.service.js';
import { success, paginated } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

// Stock-specific red flag routes (mounted at /stocks)
const redFlagStockRoutes = new Hono<{ Variables: Variables }>();

redFlagStockRoutes.use('*', authMiddleware);

// Zod schema for history query params
const historyQuerySchema = z.object({
  limit: z.string().optional().default('20'),
  offset: z.string().optional().default('0'),
});

// GET /stocks/:ticker/red-flags/history - paginated flag history for stock
// Maps to frontend RedFlagHistory format: { ticker, history: RedFlagHistoryEntry[] }
redFlagStockRoutes.get('/:ticker/red-flags/history', validateQuery(historyQuerySchema), async (c) => {
  const ticker = c.req.param('ticker');
  const query = c.req.query();

  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

  const result = await getRedFlagHistoryForStock(ticker, { limit, offset });

  // Map to frontend RedFlagHistory format: wraps entries in { ticker, history[] }
  const historyEntries = result.flags.map((flag) => ({
    id: flag.id,
    flag_name: flag.flagType
      .split('_')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    severity: flag.severity,
    detected_at: flag.detectedAt.toISOString(),
  }));

  const historyDto = {
    ticker: ticker.toUpperCase(),
    history: historyEntries,
  };

  return c.json(paginated([historyDto], result.pagination), 200);
});

// POST /stocks/:ticker/red-flags/acknowledge-all - acknowledge all flags for stock for current user
redFlagStockRoutes.post('/:ticker/red-flags/acknowledge-all', async (c) => {
  const ticker = c.req.param('ticker');
  const user = c.get('user');

  const result = await acknowledgeAllForStock(user.id, ticker);

  return c.json(success(result), 200);
});

// GET /stocks/:ticker/red-flags - detect and return flags with composite score
// Maps backend DetectedFlagResult to frontend RedFlagsResponse format
redFlagStockRoutes.get('/:ticker/red-flags', async (c) => {
  const ticker = c.req.param('ticker');

  const result = await detectRedFlags(ticker);

  // Build the breakdown from individual flag scores
  const flagsByType: Record<string, number> = {};
  for (const flag of result.flags) {
    flagsByType[flag.flag_type] = flag.score;
  }

  // Map to frontend-expected RedFlagsResponse format
  const responseDto = {
    ticker: result.ticker,
    overall_score: result.composite_score,
    breakdown: {
      consolidation_velocity: flagsByType['consolidation_velocity'] ?? 0,
      financing_velocity: flagsByType['financing_velocity'] ?? 0,
      executive_churn: flagsByType['executive_churn'] ?? 0,
      disclosure_gaps: flagsByType['disclosure_gaps'] ?? 0,
      debt_trend: flagsByType['debt_trend'] ?? 0,
    },
    detected_flags: result.flags
      .filter(f => f.score > 20) // Only show flags with meaningful scores
      .map((flag, index) => ({
        id: `${result.ticker}-${flag.flag_type}-${index}`,
        ticker: result.ticker,
        name: flag.flag_type
          .split('_')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        explanation: flag.description,
        severity: flag.score >= 80 ? 'Critical'
          : flag.score >= 60 ? 'High'
          : flag.score >= 40 ? 'Moderate'
          : 'Low',
        detected_at: result.detected_at,
        is_acknowledged: false,
      })),
  };

  return c.json(success(responseDto), 200);
});

// Global red flag routes (mounted at /red-flags)
const redFlagGlobalRoutes = new Hono<{ Variables: Variables }>();

redFlagGlobalRoutes.use('*', authMiddleware);

// GET /red-flags/trend - global trend stats (total active, 30d change, by severity, by type)
redFlagGlobalRoutes.get('/trend', async (c) => {
  const result = await getRedFlagTrend();

  return c.json(success(result), 200);
});

// GET /red-flags/history - global recent red flags across all stocks
redFlagGlobalRoutes.get('/history', validateQuery(historyQuerySchema), async (c) => {
  const query = c.req.query();

  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

  const result = await getGlobalRedFlagHistory({ limit, offset });

  const flagDtos = result.flags.map((flag) => ({
    id: flag.id,
    stock_ticker: flag.stockTicker,
    flag_type: flag.flagType,
    severity: flag.severity,
    score: flag.score,
    description: flag.description,
    detected_at: flag.detectedAt.toISOString(),
  }));

  return c.json(paginated(flagDtos, result.pagination), 200);
});

// POST /red-flags/:id/acknowledge - per-user acknowledgment of a single red flag
redFlagGlobalRoutes.post('/:id/acknowledge', async (c) => {
  const redFlagId = c.req.param('id');
  const user = c.get('user');

  const result = await acknowledgeRedFlag(user.id, redFlagId);

  return c.json(success(result), 200);
});

export { redFlagStockRoutes, redFlagGlobalRoutes };
