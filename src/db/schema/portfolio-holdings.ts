import { pgTable, uuid, varchar, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { portfolios } from './portfolios.js';
import { stocks } from './stocks.js';

/**
 * Portfolio Holdings table - individual positions within a user's portfolio.
 * Links to stocks table when the asset is in the VETTR coverage universe.
 * Supports multiple asset categories for compartmentalized display.
 */
export const portfolioHoldings = pgTable('portfolio_holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  stockId: uuid('stock_id')
    .references(() => stocks.id, { onDelete: 'set null' }), // null for non-covered assets
  ticker: varchar('ticker', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  assetCategory: varchar('asset_category', { length: 20 }).notNull().default('global'), // 'vettr_coverage' | 'large_cap_ca' | 'global' | 'alternative'
  quantity: doublePrecision('quantity').notNull().default(0),
  averageCost: doublePrecision('average_cost'),
  currentPrice: doublePrecision('current_price'),
  currentValue: doublePrecision('current_value'),
  unrealizedPnl: doublePrecision('unrealized_pnl'),
  unrealizedPnlPct: doublePrecision('unrealized_pnl_pct'),
  currency: varchar('currency', { length: 10 }).notNull().default('CAD'),
  exchange: varchar('exchange', { length: 50 }),
  sector: varchar('sector', { length: 100 }),
  lastUpdatedAt: timestamp('last_updated_at').notNull().defaultNow(),
}, (table) => ({
  portfolioIdIdx: index('portfolio_holdings_portfolio_id_idx').on(table.portfolioId),
  stockIdIdx: index('portfolio_holdings_stock_id_idx').on(table.stockId),
  tickerIdx: index('portfolio_holdings_ticker_idx').on(table.ticker),
  assetCategoryIdx: index('portfolio_holdings_asset_category_idx').on(table.assetCategory),
}));
