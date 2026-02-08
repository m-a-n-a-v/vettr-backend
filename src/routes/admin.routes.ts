import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { adminService } from '../services/admin.service.js';
import { success } from '../utils/response.js';
import { createAdminCrudRoutes } from './admin-crud.factory.js';
import { users } from '../db/schema/index.js';

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

export { adminRoutes };
