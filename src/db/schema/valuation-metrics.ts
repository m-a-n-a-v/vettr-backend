import { pgTable, uuid, doublePrecision, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Valuation metrics table - stores key ratios, risk scores, and price benchmarks
 * Sources: TMX quote data, Yahoo Finance defaultKeyStatistics + summaryDetail + assetProfile
 * One row per stock, upserted on each refresh
 */
export const valuationMetrics = pgTable('valuation_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  // Price ratios
  peRatio: doublePrecision('pe_ratio'),
  forwardPE: doublePrecision('forward_pe'),
  priceToBook: doublePrecision('price_to_book'),
  priceToCashFlow: doublePrecision('price_to_cash_flow'),
  priceToSales: doublePrecision('price_to_sales'),
  enterpriseToRevenue: doublePrecision('enterprise_to_revenue'),
  enterpriseToEbitda: doublePrecision('enterprise_to_ebitda'),

  // Valuation
  enterpriseValue: doublePrecision('enterprise_value'),
  bookValue: doublePrecision('book_value'),

  // Profitability
  profitMargins: doublePrecision('profit_margins'),
  returnOnEquity: doublePrecision('return_on_equity'),
  returnOnAssets: doublePrecision('return_on_assets'),
  earningsQuarterlyGrowth: doublePrecision('earnings_quarterly_growth'),

  // Risk
  beta: doublePrecision('beta'),
  totalDebtToEquity: doublePrecision('total_debt_to_equity'),

  // Price benchmarks
  weeks52High: doublePrecision('weeks_52_high'),
  weeks52Low: doublePrecision('weeks_52_low'),
  fiftyDayAverage: doublePrecision('fifty_day_average'),
  twoHundredDayAverage: doublePrecision('two_hundred_day_average'),
  week52Change: doublePrecision('week_52_change'),

  // EPS
  trailingEps: doublePrecision('trailing_eps'),
  forwardEps: doublePrecision('forward_eps'),

  // Governance risk scores (ISS / Yahoo)
  auditRisk: integer('audit_risk'),
  boardRisk: integer('board_risk'),
  compensationRisk: integer('compensation_risk'),
  shareholderRightsRisk: integer('shareholder_rights_risk'),
  overallRisk: integer('overall_risk'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('valuation_metrics_stock_id_idx').on(table.stockId),
}));
