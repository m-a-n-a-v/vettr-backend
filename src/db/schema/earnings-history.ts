import { pgTable, uuid, varchar, doublePrecision, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Earnings history table - stores quarterly EPS actuals, estimates, and surprises
 * Sources: TMX earnings.surprises, Yahoo earningsHistory
 * One row per stock per quarter
 */
export const earningsHistory = pgTable('earnings_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  // Quarter identifier
  quarter: timestamp('quarter').notNull(),                    // e.g. 2025-09-30
  period: varchar('period', { length: 10 }),                  // e.g. "-1q", "-2q"
  currency: varchar('currency', { length: 10 }),              // e.g. "CAD"

  // Actuals
  epsActual: doublePrecision('eps_actual'),
  epsEstimate: doublePrecision('eps_estimate'),
  epsDifference: doublePrecision('eps_difference'),
  surprisePercent: doublePrecision('surprise_percent'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('earnings_history_stock_id_idx').on(table.stockId),
  quarterIdx: index('earnings_history_quarter_idx').on(table.quarter),
  stockQuarterUniq: uniqueIndex('earnings_history_stock_quarter_uniq').on(table.stockId, table.quarter),
}));
