import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { adminService } from '../services/admin.service.js';
import { success } from '../utils/response.js';
import { createAdminCrudRoutes } from './admin-crud.factory.js';
import { users, stocks, executives, filings, alertRules, alerts, vetrScoreHistory, redFlagHistory, syncHistory, userSettings, refreshTokens, waitlist } from '../db/schema/index.js';
import { watchlistItemsRoutes, filingReadsRoutes, redFlagAcknowledgmentsRoutes } from './admin-composite-pk.routes.js';
import { db } from '../config/database.js';
import { eq, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { calculateVetrScore } from '../services/vetr-score.service.js';
import { runAllSeeds } from '../db/seed/index.js';

const adminRoutes = new Hono();

// Apply admin auth middleware to all admin routes
adminRoutes.use('*', adminAuthMiddleware);

/**
 * GET /admin/metrics
 * Returns comprehensive system metrics including:
 * - Uptime (seconds)
 * - Total request count
 * - Average response time (ms)
 * - Active users count (last 30 days)
 * - Database table row counts
 *
 * Protected by X-Admin-Secret header
 */
adminRoutes.get('/metrics', async (c) => {
  const metrics = await adminService.getSystemMetrics();
  return c.json(success(metrics));
});

/**
 * CRUD routes for users table
 * - GET /admin/users - List users with pagination, search, sort, and filters
 * - GET /admin/users/:id - Get a single user by ID
 * - POST /admin/users - Create a new user
 * - PUT /admin/users/:id - Update a user
 * - DELETE /admin/users/:id - Delete a user
 * - GET /admin/users/export - Export users as CSV or JSON
 * - POST /admin/users/bulk - Bulk create users
 * - DELETE /admin/users/bulk - Bulk delete users
 */
const usersRoutes = createAdminCrudRoutes({
  tableName: 'users',
  table: users,
  primaryKey: 'id',
  searchableColumns: ['email', 'displayName'],
  filterableColumns: ['tier', 'authProvider'],
  sortableColumns: ['email', 'displayName', 'tier', 'createdAt', 'updatedAt'],
});

adminRoutes.route('/users', usersRoutes);

/**
 * CRUD routes for stocks table
 * - GET /admin/stocks - List stocks with pagination, search, sort, and filters
 * - GET /admin/stocks/:id - Get a single stock by ID
 * - POST /admin/stocks - Create a new stock
 * - PUT /admin/stocks/:id - Update a stock
 * - DELETE /admin/stocks/:id - Delete a stock
 * - GET /admin/stocks/export - Export stocks as CSV or JSON
 * - POST /admin/stocks/bulk - Bulk create stocks
 * - DELETE /admin/stocks/bulk - Bulk delete stocks
 */
const stocksRoutes = createAdminCrudRoutes({
  tableName: 'stocks',
  table: stocks,
  primaryKey: 'id',
  searchableColumns: ['ticker', 'name'],
  filterableColumns: ['exchange', 'sector'],
  sortableColumns: ['ticker', 'name', 'exchange', 'sector', 'marketCap', 'price', 'vetrScore', 'updatedAt'],
});

adminRoutes.route('/stocks', stocksRoutes);

/**
 * CRUD routes for executives table
 * - GET /admin/executives - List executives with pagination, search, sort, and filters
 * - GET /admin/executives/:id - Get a single executive by ID
 * - POST /admin/executives - Create a new executive
 * - PUT /admin/executives/:id - Update an executive
 * - DELETE /admin/executives/:id - Delete an executive
 * - GET /admin/executives/export - Export executives as CSV or JSON
 * - POST /admin/executives/bulk - Bulk create executives
 * - DELETE /admin/executives/bulk - Bulk delete executives
 */
const executivesRoutes = createAdminCrudRoutes({
  tableName: 'executives',
  table: executives,
  primaryKey: 'id',
  searchableColumns: ['name', 'title', 'specialization'],
  filterableColumns: ['stockId'],
  sortableColumns: ['name', 'title', 'yearsAtCompany', 'createdAt', 'updatedAt'],
});

adminRoutes.route('/executives', executivesRoutes);

/**
 * CRUD routes for filings table
 * - GET /admin/filings - List filings with pagination, search, sort, and filters
 * - GET /admin/filings/:id - Get a single filing by ID
 * - POST /admin/filings - Create a new filing
 * - PUT /admin/filings/:id - Update a filing
 * - DELETE /admin/filings/:id - Delete a filing
 * - GET /admin/filings/export - Export filings as CSV or JSON
 * - POST /admin/filings/bulk - Bulk create filings
 * - DELETE /admin/filings/bulk - Bulk delete filings
 */
const filingsRoutes = createAdminCrudRoutes({
  tableName: 'filings',
  table: filings,
  primaryKey: 'id',
  searchableColumns: ['title', 'summary'],
  filterableColumns: ['stockId', 'type', 'isMaterial'],
  sortableColumns: ['title', 'type', 'date', 'isMaterial', 'createdAt'],
});

adminRoutes.route('/filings', filingsRoutes);

/**
 * CRUD routes for alertRules table
 * - GET /admin/alert-rules - List alert rules with pagination, search, sort, and filters
 * - GET /admin/alert-rules/:id - Get a single alert rule by ID
 * - POST /admin/alert-rules - Create a new alert rule
 * - PUT /admin/alert-rules/:id - Update an alert rule
 * - DELETE /admin/alert-rules/:id - Delete an alert rule
 * - GET /admin/alert-rules/export - Export alert rules as CSV or JSON
 * - POST /admin/alert-rules/bulk - Bulk create alert rules
 * - DELETE /admin/alert-rules/bulk - Bulk delete alert rules
 */
const alertRulesRoutes = createAdminCrudRoutes({
  tableName: 'alert-rules',
  table: alertRules,
  primaryKey: 'id',
  searchableColumns: ['stockTicker', 'ruleType'],
  filterableColumns: ['userId', 'stockTicker', 'ruleType', 'isActive', 'frequency'],
  sortableColumns: ['stockTicker', 'ruleType', 'isActive', 'createdAt', 'lastTriggeredAt'],
});

adminRoutes.route('/alert-rules', alertRulesRoutes);

/**
 * CRUD routes for alerts table
 * - GET /admin/alerts - List alerts with pagination, search, sort, and filters
 * - GET /admin/alerts/:id - Get a single alert by ID
 * - POST /admin/alerts - Create a new alert
 * - PUT /admin/alerts/:id - Update an alert
 * - DELETE /admin/alerts/:id - Delete an alert
 * - GET /admin/alerts/export - Export alerts as CSV or JSON
 * - POST /admin/alerts/bulk - Bulk create alerts
 * - DELETE /admin/alerts/bulk - Bulk delete alerts
 */
const alertsRoutes = createAdminCrudRoutes({
  tableName: 'alerts',
  table: alerts,
  primaryKey: 'id',
  searchableColumns: ['title', 'message'],
  filterableColumns: ['userId', 'stockId', 'alertType', 'isRead'],
  sortableColumns: ['title', 'alertType', 'triggeredAt', 'isRead'],
});

adminRoutes.route('/alerts', alertsRoutes);

/**
 * CRUD routes for vetrScoreHistory table
 * - GET /admin/vetr-score-history - List VETR score history with pagination, search, sort, and filters
 * - GET /admin/vetr-score-history/:id - Get a single VETR score record by ID
 * - POST /admin/vetr-score-history - Create a new VETR score record
 * - PUT /admin/vetr-score-history/:id - Update a VETR score record
 * - DELETE /admin/vetr-score-history/:id - Delete a VETR score record
 * - GET /admin/vetr-score-history/export - Export VETR score history as CSV or JSON
 * - POST /admin/vetr-score-history/bulk - Bulk create VETR score records
 * - DELETE /admin/vetr-score-history/bulk - Bulk delete VETR score records
 */
const vetrScoreHistoryRoutes = createAdminCrudRoutes({
  tableName: 'vetr-score-history',
  table: vetrScoreHistory,
  primaryKey: 'id',
  searchableColumns: ['stockTicker'],
  filterableColumns: ['stockTicker'],
  sortableColumns: ['stockTicker', 'overallScore', 'financialSurvivalScore', 'operationalEfficiencyScore', 'shareholderStructureScore', 'marketSentimentScore', 'calculatedAt'],
});

adminRoutes.route('/vetr-score-history', vetrScoreHistoryRoutes);

/**
 * CRUD routes for redFlagHistory table
 * - GET /admin/red-flag-history - List red flags with pagination, search, sort, and filters
 * - GET /admin/red-flag-history/:id - Get a single red flag by ID
 * - POST /admin/red-flag-history - Create a new red flag
 * - PUT /admin/red-flag-history/:id - Update a red flag
 * - DELETE /admin/red-flag-history/:id - Delete a red flag
 * - GET /admin/red-flag-history/export - Export red flags as CSV or JSON
 * - POST /admin/red-flag-history/bulk - Bulk create red flags
 * - DELETE /admin/red-flag-history/bulk - Bulk delete red flags
 */
const redFlagHistoryRoutes = createAdminCrudRoutes({
  tableName: 'red-flag-history',
  table: redFlagHistory,
  primaryKey: 'id',
  searchableColumns: ['stockTicker', 'description'],
  filterableColumns: ['stockTicker', 'flagType', 'severity'],
  sortableColumns: ['stockTicker', 'flagType', 'severity', 'score', 'detectedAt'],
});

adminRoutes.route('/red-flag-history', redFlagHistoryRoutes);

/**
 * CRUD routes for syncHistory table
 * - GET /admin/sync-history - List sync history with pagination, search, sort, and filters
 * - GET /admin/sync-history/:id - Get a single sync history record by ID
 * - POST /admin/sync-history - Create a new sync history record
 * - PUT /admin/sync-history/:id - Update a sync history record
 * - DELETE /admin/sync-history/:id - Delete a sync history record
 * - GET /admin/sync-history/export - Export sync history as CSV or JSON
 * - POST /admin/sync-history/bulk - Bulk create sync history records
 * - DELETE /admin/sync-history/bulk - Bulk delete sync history records
 */
const syncHistoryRoutes = createAdminCrudRoutes({
  tableName: 'sync-history',
  table: syncHistory,
  primaryKey: 'id',
  searchableColumns: ['status'],
  filterableColumns: ['userId', 'status'],
  sortableColumns: ['startedAt', 'completedAt', 'itemsSynced', 'status'],
});

adminRoutes.route('/sync-history', syncHistoryRoutes);

/**
 * CRUD routes for userSettings table
 * - GET /admin/user-settings - List user settings with pagination, search, sort, and filters
 * - GET /admin/user-settings/:id - Get a single user settings record by ID
 * - POST /admin/user-settings - Create a new user settings record
 * - PUT /admin/user-settings/:id - Update a user settings record
 * - DELETE /admin/user-settings/:id - Delete a user settings record
 * - GET /admin/user-settings/export - Export user settings as CSV or JSON
 * - POST /admin/user-settings/bulk - Bulk create user settings records
 * - DELETE /admin/user-settings/bulk - Bulk delete user settings records
 */
const userSettingsRoutes = createAdminCrudRoutes({
  tableName: 'user-settings',
  table: userSettings,
  primaryKey: 'id',
  searchableColumns: [],
  filterableColumns: ['userId'],
  sortableColumns: ['updatedAt'],
});

adminRoutes.route('/user-settings', userSettingsRoutes);

/**
 * CRUD routes for refreshTokens table
 * - GET /admin/refresh-tokens - List refresh tokens with pagination, search, sort, and filters
 * - GET /admin/refresh-tokens/:id - Get a single refresh token by ID
 * - POST /admin/refresh-tokens - Create a new refresh token
 * - PUT /admin/refresh-tokens/:id - Update a refresh token
 * - DELETE /admin/refresh-tokens/:id - Delete a refresh token
 * - GET /admin/refresh-tokens/export - Export refresh tokens as CSV or JSON
 * - POST /admin/refresh-tokens/bulk - Bulk create refresh tokens
 * - DELETE /admin/refresh-tokens/bulk - Bulk delete refresh tokens
 */
const refreshTokensRoutes = createAdminCrudRoutes({
  tableName: 'refresh-tokens',
  table: refreshTokens,
  primaryKey: 'id',
  searchableColumns: [],
  filterableColumns: ['userId', 'isRevoked'],
  sortableColumns: ['expiresAt', 'isRevoked', 'createdAt'],
});

adminRoutes.route('/refresh-tokens', refreshTokensRoutes);

/**
 * CRUD routes for waitlist table
 * - GET /admin/waitlist - List waitlist entries with pagination, search, sort
 * - GET /admin/waitlist/:id - Get a single waitlist entry by ID
 * - POST /admin/waitlist - Create a new waitlist entry
 * - PUT /admin/waitlist/:id - Update a waitlist entry
 * - DELETE /admin/waitlist/:id - Delete a waitlist entry
 */
const waitlistAdminRoutes = createAdminCrudRoutes({
  tableName: 'waitlist',
  table: waitlist,
  primaryKey: 'id',
  searchableColumns: ['email'],
  filterableColumns: ['source'],
  sortableColumns: ['email', 'createdAt', 'source'],
});

adminRoutes.route('/waitlist', waitlistAdminRoutes);

/**
 * Composite primary key tables (no single 'id' column)
 * These tables use custom routes instead of the generic factory
 */

/**
 * CRUD routes for watchlistItems table (composite PK: userId, stockId)
 * - GET /admin/watchlist-items - List watchlist items with pagination and filters
 * - POST /admin/watchlist-items - Create a new watchlist item
 * - DELETE /admin/watchlist-items - Delete a watchlist item by composite key (userId, stockId)
 */
adminRoutes.route('/watchlist-items', watchlistItemsRoutes);

/**
 * CRUD routes for filingReads table (composite PK: userId, filingId)
 * - GET /admin/filing-reads - List filing reads with pagination and filters
 * - POST /admin/filing-reads - Create a new filing read
 * - DELETE /admin/filing-reads - Delete a filing read by composite key (userId, filingId)
 */
adminRoutes.route('/filing-reads', filingReadsRoutes);

/**
 * CRUD routes for redFlagAcknowledgments table (composite PK: userId, redFlagId)
 * - GET /admin/red-flag-acknowledgments - List red flag acknowledgments with pagination and filters
 * - POST /admin/red-flag-acknowledgments - Create a new red flag acknowledgment
 * - DELETE /admin/red-flag-acknowledgments - Delete a red flag acknowledgment by composite key (userId, redFlagId)
 */
adminRoutes.route('/red-flag-acknowledgments', redFlagAcknowledgmentsRoutes);

/**
 * POST /admin/users/:id/change-tier
 * Specialized endpoint to change a user's tier
 * Accepts JSON body { tier: 'free' | 'pro' | 'premium' }
 * Returns the updated user info
 */
adminRoutes.post('/users/:id/change-tier', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const { tier } = body;

  // Validate tier value
  const validTiers = ['free', 'pro', 'premium'];
  if (!tier || !validTiers.includes(tier)) {
    throw new ValidationError('Invalid tier. Must be one of: free, pro, premium');
  }

  // Check if user exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (existingUser.length === 0) {
    throw new NotFoundError('User not found');
  }

  // Update the user's tier
  const updatedUser = await db
    .update(users)
    .set({ tier: tier as 'free' | 'pro' | 'premium' })
    .where(eq(users.id, id))
    .returning();

  return c.json(success({
    id: updatedUser[0].id,
    email: updatedUser[0].email,
    tier: updatedUser[0].tier,
  }));
});

/**
 * POST /admin/stocks/:ticker/recalculate-score
 * Specialized endpoint to recalculate VETR score for a stock
 * Looks up the stock by ticker, invokes the VETR score calculation logic,
 * updates the stock's vetrScore field, and creates a new vetrScoreHistory record
 * Returns the new score
 */
adminRoutes.post('/stocks/:ticker/recalculate-score', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const ticker = c.req.param('ticker').toUpperCase();

  // Check if stock exists
  const existingStock = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker))
    .limit(1);

  if (existingStock.length === 0) {
    throw new NotFoundError(`Stock with ticker ${ticker} not found`);
  }

  // Calculate the VETR score (this also saves to history and cache)
  const scoreResult = await calculateVetrScore(ticker);

  // Update the stock's vetrScore field
  await db
    .update(stocks)
    .set({ vetrScore: scoreResult.overall_score })
    .where(eq(stocks.ticker, ticker));

  return c.json(success({
    ticker: scoreResult.ticker,
    overall_score: scoreResult.overall_score,
    components: scoreResult.components,
    null_pillars: scoreResult.null_pillars,
    calculated_at: scoreResult.calculated_at,
  }));
});

/**
 * POST /admin/seed/run
 * Specialized endpoint to execute the seed script
 * Re-runs all database seed functions (stocks, filings, executives)
 * Returns a summary of seeded data
 */
adminRoutes.post('/seed/run', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  try {
    // Run the seed logic
    await runAllSeeds();

    // Get counts after seeding
    const stockCount = await db.select().from(stocks);
    const filingCount = await db.select().from(filings);
    const executiveCount = await db.select().from(executives);

    return c.json(success({
      message: 'Seed completed successfully',
      summary: {
        stocks: stockCount.length,
        filings: filingCount.length,
        executives: executiveCount.length,
      },
    }));
  } catch (error) {
    console.error('Seed error:', error);
    throw new Error(`Seed failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Analytics Endpoints
 * These endpoints return aggregated data for charts and analytics
 */

/**
 * GET /admin/analytics/user-growth
 * Returns daily new user signup counts for the last 90 days
 * Returns: { data: Array<{ date: string, count: number }> }
 */
adminRoutes.get('/analytics/user-growth', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*)::int as count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '90 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  const data = result.rows.map((row: any) => ({
    date: row.date,
    count: row.count,
  }));

  return c.json(success({ data }));
});

/**
 * GET /admin/analytics/score-distribution
 * Returns VETR score distribution buckets for the latest score per stock ticker
 * Returns: { data: Array<{ range: string, count: number }> }
 */
adminRoutes.get('/analytics/score-distribution', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.execute(sql`
    WITH latest_scores AS (
      SELECT DISTINCT ON (stock_ticker)
        stock_ticker,
        overall_score
      FROM vetr_score_history
      ORDER BY stock_ticker, calculated_at DESC
    )
    SELECT
      CASE
        WHEN overall_score BETWEEN 0 AND 20 THEN '0-20'
        WHEN overall_score BETWEEN 21 AND 40 THEN '21-40'
        WHEN overall_score BETWEEN 41 AND 60 THEN '41-60'
        WHEN overall_score BETWEEN 61 AND 80 THEN '61-80'
        WHEN overall_score BETWEEN 81 AND 100 THEN '81-100'
        ELSE 'Unknown'
      END as range,
      COUNT(*)::int as count
    FROM latest_scores
    GROUP BY range
    ORDER BY range ASC
  `);

  const data = result.rows.map((row: any) => ({
    range: row.range,
    count: row.count,
  }));

  return c.json(success({ data }));
});

/**
 * GET /admin/analytics/red-flag-trends
 * Returns red flag counts grouped by date and severity for the last 30 days
 * Returns: { data: Array<{ date: string, severity: string, count: number }> }
 */
adminRoutes.get('/analytics/red-flag-trends', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.execute(sql`
    SELECT
      DATE(detected_at) as date,
      severity,
      COUNT(*)::int as count
    FROM red_flag_history
    WHERE detected_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(detected_at), severity
    ORDER BY date ASC, severity ASC
  `);

  const data = result.rows.map((row: any) => ({
    date: row.date,
    severity: row.severity,
    count: row.count,
  }));

  return c.json(success({ data }));
});

/**
 * GET /admin/analytics/filing-activity
 * Returns daily filing counts for the last 30 days
 * Returns: { data: Array<{ date: string, count: number }> }
 */
adminRoutes.get('/analytics/filing-activity', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*)::int as count
    FROM filings
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  const data = result.rows.map((row: any) => ({
    date: row.date,
    count: row.count,
  }));

  return c.json(success({ data }));
});

/**
 * GET /admin/analytics/alert-activity
 * Returns daily alert counts for the last 30 days
 * Returns: { data: Array<{ date: string, count: number }> }
 */
adminRoutes.get('/analytics/alert-activity', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.execute(sql`
    SELECT
      DATE(triggered_at) as date,
      COUNT(*)::int as count
    FROM alerts
    WHERE triggered_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(triggered_at)
    ORDER BY date ASC
  `);

  const data = result.rows.map((row: any) => ({
    date: row.date,
    count: row.count,
  }));

  return c.json(success({ data }));
});

/**
 * GET /admin/analytics/tier-breakdown
 * Returns user count grouped by tier
 * Returns: { data: Array<{ tier: string, count: number }> }
 */
adminRoutes.get('/analytics/tier-breakdown', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.execute(sql`
    SELECT
      tier,
      COUNT(*)::int as count
    FROM users
    GROUP BY tier
    ORDER BY tier ASC
  `);

  const data = result.rows.map((row: any) => ({
    tier: row.tier,
    count: row.count,
  }));

  return c.json(success({ data }));
});

/**
 * GET /admin/analytics/stock-health
 * Returns the 10 stocks with lowest VETR scores and the 10 stocks with most red flags
 * Returns: { data: { lowest_scores: Array<{ ticker, name, vetr_score }>, most_flags: Array<{ ticker, name, flag_count }> } }
 */
adminRoutes.get('/analytics/stock-health', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Get 10 stocks with lowest VETR scores
  const lowestScoresResult = await db.execute(sql`
    SELECT
      ticker,
      name,
      vetr_score
    FROM stocks
    WHERE vetr_score IS NOT NULL
    ORDER BY vetr_score ASC
    LIMIT 10
  `);

  const lowestScores = lowestScoresResult.rows.map((row: any) => ({
    ticker: row.ticker,
    name: row.name,
    vetr_score: row.vetr_score,
  }));

  // Get 10 stocks with most red flags
  const mostFlagsResult = await db.execute(sql`
    SELECT
      s.ticker,
      s.name,
      COUNT(rf.id)::int as flag_count
    FROM stocks s
    LEFT JOIN red_flag_history rf ON s.ticker = rf.stock_ticker
    GROUP BY s.ticker, s.name
    ORDER BY flag_count DESC
    LIMIT 10
  `);

  const mostFlags = mostFlagsResult.rows.map((row: any) => ({
    ticker: row.ticker,
    name: row.name,
    flag_count: row.flag_count,
  }));

  return c.json(success({
    data: {
      lowest_scores: lowestScores,
      most_flags: mostFlags,
    },
  }));
});

export { adminRoutes };
