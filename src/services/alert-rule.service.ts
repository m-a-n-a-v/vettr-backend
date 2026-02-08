import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { alertRules } from '../db/schema/index.js';
import { InternalError, NotFoundError, TierLimitError, ConflictError, ForbiddenError } from '../utils/errors.js';

const MAX_RULES_PER_USER = 50;

export interface CreateRuleInput {
  userId: string;
  stockTicker: string;
  ruleType: string;
  triggerConditions: Record<string, any>;
  conditionOperator?: string;
  frequency?: string;
  threshold?: number;
}

export interface UpdateRuleInput {
  ruleType?: string;
  triggerConditions?: Record<string, any>;
  conditionOperator?: string;
  frequency?: string;
  threshold?: number | null;
  isActive?: boolean;
}

export async function createRule(input: CreateRuleInput) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Enforce max 50 rules per user
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alertRules)
    .where(eq(alertRules.userId, input.userId));

  const currentCount = countResult[0]?.count ?? 0;
  if (currentCount >= MAX_RULES_PER_USER) {
    throw new TierLimitError(
      `Maximum of ${MAX_RULES_PER_USER} alert rules allowed`,
      { current_count: currentCount, max_allowed: MAX_RULES_PER_USER }
    );
  }

  // Detect duplicate rules (same stock + type for this user)
  const duplicateResult = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.userId, input.userId),
        eq(alertRules.stockTicker, input.stockTicker),
        eq(alertRules.ruleType, input.ruleType)
      )
    )
    .limit(1);

  if (duplicateResult.length > 0) {
    throw new ConflictError(
      `Alert rule for ${input.stockTicker} with type '${input.ruleType}' already exists`,
      { existing_rule_id: duplicateResult[0]!.id }
    );
  }

  const result = await db
    .insert(alertRules)
    .values({
      userId: input.userId,
      stockTicker: input.stockTicker.toUpperCase(),
      ruleType: input.ruleType,
      triggerConditions: input.triggerConditions,
      conditionOperator: input.conditionOperator ?? 'AND',
      frequency: input.frequency ?? 'instant',
      threshold: input.threshold ?? null,
    })
    .returning();

  return result[0]!;
}

export async function updateRule(ruleId: string, userId: string, input: UpdateRuleInput) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Find the rule and validate ownership
  const existing = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.id, ruleId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Alert rule not found`);
  }

  if (existing[0]!.userId !== userId) {
    throw new ForbiddenError('You do not have permission to update this alert rule');
  }

  // Check for duplicate if ruleType or stockTicker are being changed
  if (input.ruleType && input.ruleType !== existing[0]!.ruleType) {
    const duplicateResult = await db
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.userId, userId),
          eq(alertRules.stockTicker, existing[0]!.stockTicker),
          eq(alertRules.ruleType, input.ruleType)
        )
      )
      .limit(1);

    if (duplicateResult.length > 0) {
      throw new ConflictError(
        `Alert rule for ${existing[0]!.stockTicker} with type '${input.ruleType}' already exists`,
        { existing_rule_id: duplicateResult[0]!.id }
      );
    }
  }

  const updateData: Record<string, any> = {};
  if (input.ruleType !== undefined) updateData.ruleType = input.ruleType;
  if (input.triggerConditions !== undefined) updateData.triggerConditions = input.triggerConditions;
  if (input.conditionOperator !== undefined) updateData.conditionOperator = input.conditionOperator;
  if (input.frequency !== undefined) updateData.frequency = input.frequency;
  if (input.threshold !== undefined) updateData.threshold = input.threshold;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const result = await db
    .update(alertRules)
    .set(updateData)
    .where(eq(alertRules.id, ruleId))
    .returning();

  return result[0]!;
}

export async function deleteRule(ruleId: string, userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Find the rule and validate ownership
  const existing = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.id, ruleId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Alert rule not found`);
  }

  if (existing[0]!.userId !== userId) {
    throw new ForbiddenError('You do not have permission to delete this alert rule');
  }

  await db
    .delete(alertRules)
    .where(eq(alertRules.id, ruleId));

  return { deleted: true };
}

export async function getRulesForUser(userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const rules = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.userId, userId))
    .orderBy(alertRules.createdAt);

  return rules;
}

export async function getRulesForStock(userId: string, stockTicker: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.userId, userId),
        eq(alertRules.stockTicker, stockTicker.toUpperCase())
      )
    )
    .orderBy(alertRules.createdAt);

  return rules;
}

export async function toggleActive(ruleId: string, userId: string, isActive: boolean) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Find the rule and validate ownership
  const existing = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.id, ruleId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Alert rule not found`);
  }

  if (existing[0]!.userId !== userId) {
    throw new ForbiddenError('You do not have permission to modify this alert rule');
  }

  const result = await db
    .update(alertRules)
    .set({ isActive })
    .where(eq(alertRules.id, ruleId))
    .returning();

  return result[0]!;
}
