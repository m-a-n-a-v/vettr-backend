import { pgTable, uuid, varchar, jsonb, timestamp, boolean, doublePrecision, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockTicker: varchar('stock_ticker', { length: 10 }).notNull(),
  ruleType: varchar('rule_type', { length: 50 }).notNull(),
  triggerConditions: jsonb('trigger_conditions').notNull().$type<Record<string, any>>(),
  conditionOperator: varchar('condition_operator', { length: 10 }).notNull().default('AND'),
  frequency: varchar('frequency', { length: 20 }).notNull().default('instant'),
  threshold: doublePrecision('threshold'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastTriggeredAt: timestamp('last_triggered_at'),
}, (table) => ({
  userIdIdx: index('alert_rules_user_id_idx').on(table.userId),
  stockTickerIdx: index('alert_rules_stock_ticker_idx').on(table.stockTicker),
}));
