import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/validator.js';
import {
  createRule,
  updateRule,
  deleteRule,
  getRulesForUser,
  getRulesForStock,
  toggleActive,
} from '../services/alert-rule.service.js';
import {
  getAlertsForUser,
  markAlertAsRead,
  markAllAlertsAsRead,
  deleteAlert,
  getUnreadCount,
} from '../services/alert.service.js';
import { success, paginated } from '../utils/response.js';
import { evaluateAlerts } from '../services/alert-evaluation.service.js';
import { generateNotificationsForUser } from '../services/notification-generator.service.js';

type Variables = {
  user: AuthUser;
};

const alertRoutes = new Hono<{ Variables: Variables }>();

// POST /alerts/evaluate - Admin-only: trigger alert evaluation
alertRoutes.post('/evaluate', async (c) => {
  // Check admin secret
  const adminSecret = c.req.header('X-Admin-Secret');
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid admin secret' } }, 403);
  }

  const result = await evaluateAlerts();
  return c.json(success({ triggered_count: result.triggeredCount, evaluated_rules: result.evaluatedRules }), 200);
});

// Apply auth middleware to all alert routes
alertRoutes.use('*', authMiddleware);

// ─── DTO Helpers ────────────────────────────────────────────────────────────

// Helper function to convert triggered alert to DTO
function toAlertDto(alert: any, stockTicker?: string) {
  return {
    id: alert.id,
    stock_ticker: stockTicker || alert.stockTicker || '',
    alert_type: alert.alertType,
    title: alert.title,
    message: alert.message,
    triggered_at: alert.triggeredAt?.toISOString?.() || alert.triggeredAt,
    is_read: alert.isRead,
    rule_id: alert.alertRuleId,
  };
}

// Helper function to convert alert rule to DTO
function toAlertRuleDto(rule: any) {
  return {
    id: rule.id,
    stock_ticker: rule.stockTicker,
    rule_type: rule.ruleType,
    trigger_conditions: rule.triggerConditions,
    condition_operator: rule.conditionOperator,
    frequency: rule.frequency,
    threshold: rule.threshold,
    is_active: rule.isActive,
    created_at: rule.createdAt.toISOString(),
    last_triggered_at: rule.lastTriggeredAt?.toISOString() ?? null,
  };
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

// Zod schema for creating an alert rule
const createAlertRuleSchema = z.object({
  stock_ticker: z.string().min(1).max(10),
  rule_type: z.string().min(1).max(50),
  trigger_conditions: z.record(z.any()).optional().default({}),
  condition_operator: z.enum(['AND', 'OR']).optional(),
  frequency: z.enum(['instant', 'daily', 'weekly']).optional(),
  threshold: z.number().optional(),
});

// Zod schema for updating an alert rule
const updateAlertRuleSchema = z.object({
  rule_type: z.string().min(1).max(50).optional(),
  trigger_conditions: z.record(z.any()).optional(),
  condition_operator: z.enum(['AND', 'OR']).optional(),
  frequency: z.enum(['instant', 'daily', 'weekly']).optional(),
  threshold: z.number().nullable().optional(),
  is_active: z.boolean().optional(),
});

// ─── Triggered Alert Routes ─────────────────────────────────────────────────
// These are registered BEFORE the /rules/* routes and /:id routes to avoid conflicts.

// GET /alerts - List user's triggered alerts with pagination
alertRoutes.get('/', async (c) => {
  const user = c.get('user');
  const unreadOnly = c.req.query('unread_only') === 'true';
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Lazily generate notifications (fire-and-forget, runs at most once per 24h)
  generateNotificationsForUser(user.id).catch((err) =>
    console.error('Notification generation failed:', err)
  );

  const { rows, total } = await getAlertsForUser(user.id, { unreadOnly, limit, offset });

  const alertsDto = rows.map((row) => toAlertDto(row, row.stockTicker ?? undefined));

  return c.json(
    paginated(alertsDto, {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    }),
    200,
  );
});

// GET /alerts/unread-count - Get unread alert count
alertRoutes.get('/unread-count', async (c) => {
  const user = c.get('user');

  // Lazily generate notifications (fire-and-forget, runs at most once per 24h)
  generateNotificationsForUser(user.id).catch((err) =>
    console.error('Notification generation failed:', err)
  );

  const count = await getUnreadCount(user.id);

  return c.json(success({ unread_count: count }), 200);
});

// POST /alerts/read-all - Mark all alerts as read
alertRoutes.post('/read-all', async (c) => {
  const user = c.get('user');
  await markAllAlertsAsRead(user.id);

  return c.json(success({ updated: true }), 200);
});

// POST /alerts/:id/read - Mark single alert as read
alertRoutes.post('/:id/read', async (c) => {
  const user = c.get('user');
  const alertId = c.req.param('id');

  const alert = await markAlertAsRead(alertId, user.id);
  const alertDto = toAlertDto(alert);

  return c.json(success(alertDto), 200);
});

// DELETE /alerts/:id - Delete a triggered alert
alertRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const alertId = c.req.param('id');

  await deleteAlert(alertId, user.id);

  return c.json(success({ deleted: true }), 200);
});

// ─── Alert Rule Routes ──────────────────────────────────────────────────────

// GET /alerts/rules - List user's alert rules
alertRoutes.get('/rules', async (c) => {
  const user = c.get('user');
  const rules = await getRulesForUser(user.id);

  const rulesDto = rules.map(toAlertRuleDto);

  return c.json(success(rulesDto), 200);
});

// POST /alerts/rules - Create rule (validates limit + duplicates)
alertRoutes.post('/rules', validateBody(createAlertRuleSchema), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const rule = await createRule({
    userId: user.id,
    stockTicker: body.stock_ticker,
    ruleType: body.rule_type,
    triggerConditions: body.trigger_conditions,
    conditionOperator: body.condition_operator,
    frequency: body.frequency,
    threshold: body.threshold,
  });

  const ruleDto = toAlertRuleDto(rule);

  return c.json(success(ruleDto), 201);
});

// PUT /alerts/rules/:id - Update rule (validates ownership)
alertRoutes.put('/rules/:id', validateBody(updateAlertRuleSchema), async (c) => {
  const user = c.get('user');
  const ruleId = c.req.param('id');
  const body = await c.req.json();

  const rule = await updateRule(ruleId, user.id, {
    ruleType: body.rule_type,
    triggerConditions: body.trigger_conditions,
    conditionOperator: body.condition_operator,
    frequency: body.frequency,
    threshold: body.threshold,
    isActive: body.is_active,
  });

  const ruleDto = toAlertRuleDto(rule);

  return c.json(success(ruleDto), 200);
});

// DELETE /alerts/rules/:id - Delete rule (validates ownership)
alertRoutes.delete('/rules/:id', async (c) => {
  const user = c.get('user');
  const ruleId = c.req.param('id');

  await deleteRule(ruleId, user.id);

  return c.json(success({ deleted: true }), 200);
});

// POST /alerts/rules/:id/enable - Enable alert rule
alertRoutes.post('/rules/:id/enable', async (c) => {
  const user = c.get('user');
  const ruleId = c.req.param('id');

  const rule = await toggleActive(ruleId, user.id, true);
  const ruleDto = toAlertRuleDto(rule);

  return c.json(success(ruleDto), 200);
});

// POST /alerts/rules/:id/disable - Disable alert rule
alertRoutes.post('/rules/:id/disable', async (c) => {
  const user = c.get('user');
  const ruleId = c.req.param('id');

  const rule = await toggleActive(ruleId, user.id, false);
  const ruleDto = toAlertRuleDto(rule);

  return c.json(success(ruleDto), 200);
});

// GET /stocks/:ticker/alerts/rules - Get all alert rules for a specific stock
alertRoutes.get('/stocks/:ticker/rules', async (c) => {
  const user = c.get('user');
  const ticker = c.req.param('ticker');

  const rules = await getRulesForStock(user.id, ticker);
  const rulesDto = rules.map(toAlertRuleDto);

  return c.json(success(rulesDto), 200);
});

export { alertRoutes };
