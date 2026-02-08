import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { stocks } from './stocks.js';
import { alertRules } from './alert-rules.js';

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: uuid('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  alertRuleId: uuid('alert_rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
  alertType: varchar('alert_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  triggeredAt: timestamp('triggered_at').notNull().defaultNow(),
  isRead: boolean('is_read').notNull().default(false),
}, (table) => ({
  userIdIdx: index('alerts_user_id_idx').on(table.userId),
  stockIdIdx: index('alerts_stock_id_idx').on(table.stockId),
  alertRuleIdIdx: index('alerts_alert_rule_id_idx').on(table.alertRuleId),
}));
