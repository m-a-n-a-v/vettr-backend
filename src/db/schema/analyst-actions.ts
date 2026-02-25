import { pgTable, uuid, varchar, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Analyst actions table - stores individual upgrade/downgrade/initiation history
 * Source: Yahoo upgradeDowngradeHistory
 * One row per analyst action per stock
 */
export const analystActions = pgTable('analyst_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  actionDate: timestamp('action_date').notNull(),
  firm: varchar('firm', { length: 255 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(),       // "init", "main", "up", "down", "reit"
  toGrade: varchar('to_grade', { length: 50 }),               // "Buy", "Hold", "Sell", "Outperform"
  fromGrade: varchar('from_grade', { length: 50 }),

  // Price target changes
  priceTargetAction: varchar('price_target_action', { length: 30 }), // "Raises", "Lowers", "Announces"
  currentPriceTarget: doublePrecision('current_price_target'),
  priorPriceTarget: doublePrecision('prior_price_target'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('analyst_actions_stock_id_idx').on(table.stockId),
  dateIdx: index('analyst_actions_date_idx').on(table.actionDate),
}));
