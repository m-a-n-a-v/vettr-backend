import { pgTable, uuid, varchar, doublePrecision, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Financial summary - key financial metrics from Yahoo financialData + summaryDetail + price modules.
 * One row per stock, upserted on each refresh.
 */
export const financialSummary = pgTable('financial_summary', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  // Revenue & profitability
  totalRevenue: doublePrecision('total_revenue'),
  grossProfit: doublePrecision('gross_profit'),
  ebitda: doublePrecision('ebitda'),
  netIncome: doublePrecision('net_income'),
  operatingCashFlow: doublePrecision('operating_cash_flow'),
  freeCashFlow: doublePrecision('free_cash_flow'),

  // Cash & debt
  totalCash: doublePrecision('total_cash'),
  totalCashPerShare: doublePrecision('total_cash_per_share'),
  totalDebt: doublePrecision('total_debt'),
  revenuePerShare: doublePrecision('revenue_per_share'),

  // Margins
  grossMargins: doublePrecision('gross_margins'),
  operatingMargins: doublePrecision('operating_margins'),
  ebitdaMargins: doublePrecision('ebitda_margins'),

  // Growth
  revenueGrowth: doublePrecision('revenue_growth'),
  earningsGrowth: doublePrecision('earnings_growth'),

  // Ratios
  currentRatio: doublePrecision('current_ratio'),
  quickRatio: doublePrecision('quick_ratio'),

  // Shares
  sharesOutstanding: bigint('shares_outstanding', { mode: 'number' }),
  floatShares: bigint('float_shares', { mode: 'number' }),

  // Currency
  currency: varchar('currency', { length: 10 }),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('financial_summary_stock_id_idx').on(table.stockId),
}));
