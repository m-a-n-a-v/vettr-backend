import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  getPortfolioInsights,
  getAllUserInsights,
  dismissInsight,
} from '../services/portfolio-insights.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const portfolioInsightsRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware
portfolioInsightsRoutes.use('*', authMiddleware);

/**
 * GET /portfolio-insights
 * Get all insights across all user portfolios
 */
portfolioInsightsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const insights = await getAllUserInsights(user.id);
  return c.json(success(insights), 200);
});

/**
 * GET /portfolio-insights/:portfolioId
 * Get insights for a specific portfolio
 */
portfolioInsightsRoutes.get('/:portfolioId', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('portfolioId');
  const insights = await getPortfolioInsights(user.id, portfolioId);
  return c.json(success(insights), 200);
});

/**
 * POST /portfolio-insights/:insightId/dismiss
 * Dismiss an insight
 */
portfolioInsightsRoutes.post('/:insightId/dismiss', async (c) => {
  const user = c.get('user');
  const insightId = c.req.param('insightId');
  const result = await dismissInsight(user.id, insightId);
  return c.json(success(result), 200);
});

export { portfolioInsightsRoutes };
