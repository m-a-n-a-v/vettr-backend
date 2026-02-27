import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  createPortfolio,
  getUserPortfolios,
  getPortfolioById,
  deletePortfolio,
  addHolding,
  getPortfolioHoldings,
  getAllUserHoldings,
  getCategorizedHoldings,
  removeHolding,
  getPortfolioSummary,
  getPortfolioSnapshots,
  importHoldingsFromCsv,
} from '../services/portfolio.service.js';
import { success } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';

type Variables = {
  user: AuthUser;
};

const portfolioRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all portfolio routes
portfolioRoutes.use('*', authMiddleware);

/**
 * POST /portfolio
 * Create a new portfolio connection
 */
portfolioRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const { connectionType, connectionId, institutionName } = body;

  if (!connectionType || !['flinks', 'snaptrade', 'csv', 'manual'].includes(connectionType)) {
    throw new ValidationError('connectionType must be one of: flinks, snaptrade, csv, manual');
  }

  const portfolio = await createPortfolio(user.id, {
    connectionType,
    connectionId,
    institutionName,
  });

  return c.json(success(portfolio), 201);
});

/**
 * GET /portfolio
 * List all portfolios for the authenticated user
 */
portfolioRoutes.get('/', async (c) => {
  const user = c.get('user');
  const portfolios = await getUserPortfolios(user.id);
  return c.json(success(portfolios), 200);
});

/**
 * GET /portfolio/summary
 * Get aggregated portfolio summary with P&L and coverage
 */
portfolioRoutes.get('/summary', async (c) => {
  const user = c.get('user');
  const summary = await getPortfolioSummary(user.id);
  return c.json(success(summary), 200);
});

/**
 * GET /portfolio/holdings
 * Get all holdings across all portfolios
 */
portfolioRoutes.get('/holdings', async (c) => {
  const user = c.get('user');
  const holdings = await getAllUserHoldings(user.id);
  return c.json(success(holdings), 200);
});

/**
 * GET /portfolio/holdings/categorized
 * Get holdings grouped by asset category
 */
portfolioRoutes.get('/holdings/categorized', async (c) => {
  const user = c.get('user');
  const categorized = await getCategorizedHoldings(user.id);
  return c.json(success(categorized), 200);
});

/**
 * GET /portfolio/:id
 * Get a single portfolio with details
 */
portfolioRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('id');
  const portfolio = await getPortfolioById(user.id, portfolioId);
  return c.json(success(portfolio), 200);
});

/**
 * DELETE /portfolio/:id
 * Delete a portfolio and all its holdings
 */
portfolioRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('id');
  const result = await deletePortfolio(user.id, portfolioId);
  return c.json(success(result), 200);
});

/**
 * POST /portfolio/:id/holdings
 * Add a holding to a portfolio
 */
portfolioRoutes.post('/:id/holdings', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('id');
  const body = await c.req.json();

  const { ticker, quantity, averageCost, assetCategory } = body;

  if (!ticker || typeof quantity !== 'number' || typeof averageCost !== 'number') {
    throw new ValidationError('ticker (string), quantity (number), and averageCost (number) are required');
  }

  const holding = await addHolding(user.id, portfolioId, {
    ticker,
    quantity,
    averageCost,
    assetCategory,
  });

  return c.json(success(holding), 201);
});

/**
 * GET /portfolio/:id/holdings
 * Get all holdings for a specific portfolio
 */
portfolioRoutes.get('/:id/holdings', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('id');
  const holdings = await getPortfolioHoldings(user.id, portfolioId);
  return c.json(success(holdings), 200);
});

/**
 * DELETE /portfolio/holdings/:holdingId
 * Remove a holding
 */
portfolioRoutes.delete('/holdings/:holdingId', async (c) => {
  const user = c.get('user');
  const holdingId = c.req.param('holdingId');
  const result = await removeHolding(user.id, holdingId);
  return c.json(success(result), 200);
});

/**
 * GET /portfolio/:id/snapshots
 * Get portfolio value snapshots for charts
 */
portfolioRoutes.get('/:id/snapshots', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('id');
  const days = parseInt(c.req.query('days') ?? '30', 10);
  const snapshots = await getPortfolioSnapshots(user.id, portfolioId, days);
  return c.json(success(snapshots), 200);
});

/**
 * POST /portfolio/:id/import-csv
 * Import holdings from CSV data
 * Expects JSON body: { rows: [{ ticker, shares, avgCost }] }
 */
portfolioRoutes.post('/:id/import-csv', async (c) => {
  const user = c.get('user');
  const portfolioId = c.req.param('id');
  const body = await c.req.json();

  const { rows } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ValidationError('rows must be a non-empty array of { ticker, shares, avgCost }');
  }

  // Validate each row
  for (const row of rows) {
    if (!row.ticker || typeof row.shares !== 'number' || typeof row.avgCost !== 'number') {
      throw new ValidationError(`Invalid row: ${JSON.stringify(row)}. Each row needs ticker, shares, avgCost`);
    }
  }

  const results = await importHoldingsFromCsv(user.id, portfolioId, rows);
  return c.json(success(results), 200);
});

export { portfolioRoutes };
