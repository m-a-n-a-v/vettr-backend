import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { adminService } from '../services/admin.service.js';
import { success } from '../utils/response.js';

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

export { adminRoutes };
