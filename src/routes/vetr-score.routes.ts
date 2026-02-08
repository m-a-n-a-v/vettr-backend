import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { calculateVetrScore, getScoreHistory } from '../services/vetr-score.service.js';
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

// GET /stocks/:ticker/vetr-score/history - Return score history from DB
vetrScoreRoutes.get('/:ticker/vetr-score/history', validateQuery(historyQuerySchema), async (c) => {
  const ticker = c.req.param('ticker');
  const query = c.req.query();

  const months = Math.min(Math.max(parseInt(query.months || '6', 10) || 6, 1), 24);

  const history = await getScoreHistory(ticker, months);

  return c.json(success(history), 200);
});

// GET /stocks/:ticker/vetr-score - Return current score with all component breakdowns
vetrScoreRoutes.get('/:ticker/vetr-score', async (c) => {
  const ticker = c.req.param('ticker');

  // Calculate or return cached score
  const score = await calculateVetrScore(ticker);

  return c.json(success(score), 200);
});

export { vetrScoreRoutes };
