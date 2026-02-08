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
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const alertRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all alert routes
alertRoutes.use('*', authMiddleware);

// Zod schema for creating an alert rule
const createAlertRuleSchema = z.object({
  stock_ticker: z.string().min(1).max(10),
  rule_type: z.string().min(1).max(50),
  trigger_conditions: z.record(z.any()),
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
