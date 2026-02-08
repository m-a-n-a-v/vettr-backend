import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { adminService } from '../services/admin.service.js';
import { success } from '../utils/response.js';
import { createAdminCrudRoutes } from './admin-crud.factory.js';
import { users, stocks, executives, filings } from '../db/schema/index.js';

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

export { adminRoutes };
