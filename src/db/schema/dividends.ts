import { pgTable, uuid, varchar, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Dividend info table - stores current dividend metrics for a stock
 * Sources: TMX quote, Yahoo summaryDetail
 * One row per stock, upserted on each refresh
 */
export const dividendInfo = pgTable('dividend_info', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  dividendYield: doublePrecision('dividend_yield'),           // as decimal, e.g. 0.032
  dividendAmount: doublePrecision('dividend_amount'),         // per-share amount
  payoutRatio: doublePrecision('payout_ratio'),
  exDividendDate: timestamp('ex_dividend_date'),
  dividendPayDate: timestamp('dividend_pay_date'),
  dividendFrequency: varchar('dividend_frequency', { length: 30 }),  // "Quarterly", "Monthly", "Annual"
  dividendCurrency: varchar('dividend_currency', { length: 10 }),
  trailingAnnualDividendRate: doublePrecision('trailing_annual_dividend_rate'),
  trailingAnnualDividendYield: doublePrecision('trailing_annual_dividend_yield'),
  dividend3Years: doublePrecision('dividend_3_years'),
  dividend5Years: doublePrecision('dividend_5_years'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('dividend_info_stock_id_idx').on(table.stockId),
}));
