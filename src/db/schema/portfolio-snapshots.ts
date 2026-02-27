import { pgTable, uuid, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { portfolios } from './portfolios.js';

/**
 * Portfolio Snapshots table - daily portfolio value snapshots for P&L tracking and charts.
 * One snapshot per portfolio per day, recording aggregate values.
 */
export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  totalValue: doublePrecision('total_value').notNull().default(0),
  totalCost: doublePrecision('total_cost').notNull().default(0),
  totalPnl: doublePrecision('total_pnl').notNull().default(0),
  totalPnlPct: doublePrecision('total_pnl_pct').notNull().default(0),
  vettrCoverageValue: doublePrecision('vettr_coverage_value').notNull().default(0),
  vettrCoveragePct: doublePrecision('vettr_coverage_pct').notNull().default(0),
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
}, (table) => ({
  portfolioIdIdx: index('portfolio_snapshots_portfolio_id_idx').on(table.portfolioId),
  recordedAtIdx: index('portfolio_snapshots_recorded_at_idx').on(table.recordedAt),
}));
