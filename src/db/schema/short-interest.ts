import { pgTable, uuid, doublePrecision, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Short interest table - stores short selling data
 * Source: TMX shortInterest
 * One row per stock, upserted on each refresh (latest snapshot)
 */
export const shortInterest = pgTable('short_interest', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  shortShares: bigint('short_shares', { mode: 'number' }),
  shortInterestPct: doublePrecision('short_interest_pct'),    // as decimal, e.g. 0.0219
  daysToCover10d: doublePrecision('days_to_cover_10d'),
  daysToCover30d: doublePrecision('days_to_cover_30d'),
  daysToCover90d: doublePrecision('days_to_cover_90d'),

  reportDate: timestamp('report_date'),                       // date of SI report

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('short_interest_stock_id_idx').on(table.stockId),
}));
