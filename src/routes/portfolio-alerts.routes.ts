import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  getUserAlerts,
  getUnreadCount,
  markAlertRead,
  markAllAlertsRead,
} from '../services/portfolio-alerts.service.js';
import { success, paginated } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const portfolioAlertsRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware
portfolioAlertsRoutes.use('*', authMiddleware);

/**
 * GET /portfolio-alerts
 * List alerts for the authenticated user
 * Query params: unread_only (boolean), limit, offset
 */
portfolioAlertsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const unreadOnly = c.req.query('unread_only') === 'true';
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const { items, total } = await getUserAlerts(user.id, { unreadOnly, limit, offset });

  return c.json(paginated(items, {
    total,
    limit,
    offset,
    has_more: offset + limit < total,
  }), 200);
});

/**
 * GET /portfolio-alerts/unread-count
 * Get the number of unread alerts
 */
portfolioAlertsRoutes.get('/unread-count', async (c) => {
  const user = c.get('user');
  const count = await getUnreadCount(user.id);
  return c.json(success({ count }), 200);
});

/**
 * POST /portfolio-alerts/mark-all-read
 * Mark all alerts as read
 */
portfolioAlertsRoutes.post('/mark-all-read', async (c) => {
  const user = c.get('user');
  const result = await markAllAlertsRead(user.id);
  return c.json(success(result), 200);
});

/**
 * POST /portfolio-alerts/:id/read
 * Mark a single alert as read
 */
portfolioAlertsRoutes.post('/:id/read', async (c) => {
  const user = c.get('user');
  const alertId = c.req.param('id');
  const result = await markAlertRead(user.id, alertId);
  return c.json(success(result), 200);
});

export { portfolioAlertsRoutes };
