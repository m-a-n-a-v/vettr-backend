import { Hono } from 'hono';
import { getSamplePortfolios } from '../services/sample-portfolios.service.js';
import { success } from '../utils/response.js';

const samplePortfolioRoutes = new Hono();

// GET /sample-portfolios - Public endpoint, no auth required
// Returns 4 themed sample portfolios with 10 stocks each
samplePortfolioRoutes.get('/', async (c) => {
  const result = await getSamplePortfolios();
  return c.json(success(result), 200);
});

export { samplePortfolioRoutes };
