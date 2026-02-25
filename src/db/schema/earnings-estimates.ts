import { pgTable, uuid, varchar, doublePrecision, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Earnings estimates table - stores forward-looking EPS/revenue estimates, trends, and revisions
 * Sources: Yahoo earningsTrend (periods: 0q, +1q, 0y, +1y)
 * One row per stock per estimate period
 */
export const earningsEstimates = pgTable('earnings_estimates', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  // Period identifier
  period: varchar('period', { length: 10 }).notNull(),        // "0q", "+1q", "0y", "+1y"
  endDate: timestamp('end_date'),                             // e.g. 2025-12-31
  currency: varchar('currency', { length: 10 }),

  // EPS estimates
  epsAvg: doublePrecision('eps_avg'),
  epsLow: doublePrecision('eps_low'),
  epsHigh: doublePrecision('eps_high'),
  epsYearAgo: doublePrecision('eps_year_ago'),
  epsGrowth: doublePrecision('eps_growth'),
  numberOfAnalystsEps: integer('number_of_analysts_eps'),

  // Revenue estimates
  revenueAvg: doublePrecision('revenue_avg'),
  revenueLow: doublePrecision('revenue_low'),
  revenueHigh: doublePrecision('revenue_high'),
  revenueYearAgo: doublePrecision('revenue_year_ago'),
  revenueGrowth: doublePrecision('revenue_growth'),
  numberOfAnalystsRevenue: integer('number_of_analysts_revenue'),

  // EPS trend (how estimates have changed over time)
  epsTrendCurrent: doublePrecision('eps_trend_current'),
  epsTrend7dAgo: doublePrecision('eps_trend_7d_ago'),
  epsTrend30dAgo: doublePrecision('eps_trend_30d_ago'),
  epsTrend60dAgo: doublePrecision('eps_trend_60d_ago'),
  epsTrend90dAgo: doublePrecision('eps_trend_90d_ago'),

  // EPS revisions (analyst estimate changes)
  revisionsUpLast7d: integer('revisions_up_last_7d'),
  revisionsUpLast30d: integer('revisions_up_last_30d'),
  revisionsDownLast7d: integer('revisions_down_last_7d'),
  revisionsDownLast30d: integer('revisions_down_last_30d'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('earnings_estimates_stock_id_idx').on(table.stockId),
  stockPeriodUniq: uniqueIndex('earnings_estimates_stock_period_uniq').on(table.stockId, table.period),
}));
