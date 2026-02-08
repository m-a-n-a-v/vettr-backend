import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { adminService } from '../services/admin.service.js';
import { success } from '../utils/response.js';
import { createAdminCrudRoutes } from './admin-crud.factory.js';
import { users, stocks, executives, filings, alertRules, alerts, vetrScoreHistory, redFlagHistory, syncHistory, userSettings, refreshTokens } from '../db/schema/index.js';
import { watchlistItemsRoutes, filingReadsRoutes, redFlagAcknowledgmentsRoutes } from './admin-composite-pk.routes.js';

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
  sortableColumns: ['stockTicker', 'overallScore', 'pedigreeScore', 'filingVelocityScore', 'redFlagScore', 'growthScore', 'governanceScore', 'calculatedAt'],
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

export { adminRoutes };
