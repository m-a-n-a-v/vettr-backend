import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  detectRedFlags,
  getRedFlagHistoryForStock,
  getGlobalRedFlagHistory,
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
redFlagStockRoutes.get('/:ticker/red-flags/history', validateQuery(historyQuerySchema), async (c) => {
  const ticker = c.req.param('ticker');
  const query = c.req.query();

  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

  const result = await getRedFlagHistoryForStock(ticker, { limit, offset });

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

// GET /stocks/:ticker/red-flags - detect and return flags with composite score
redFlagStockRoutes.get('/:ticker/red-flags', async (c) => {
  const ticker = c.req.param('ticker');

  const result = await detectRedFlags(ticker);

  return c.json(success(result), 200);
});

// Global red flag routes (mounted at /red-flags)
const redFlagGlobalRoutes = new Hono<{ Variables: Variables }>();

redFlagGlobalRoutes.use('*', authMiddleware);

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

export { redFlagStockRoutes, redFlagGlobalRoutes };
