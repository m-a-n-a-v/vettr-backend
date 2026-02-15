import { pgTable, uuid, doublePrecision, bigint, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

export const financialData = pgTable('financial_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),
  cash: doublePrecision('cash'),
  monthlyBurn: doublePrecision('monthly_burn'),
  totalDebt: doublePrecision('total_debt'),
  totalAssets: doublePrecision('total_assets'),
  explorationExp: doublePrecision('exploration_exp'),
  rAndDExp: doublePrecision('r_and_d_exp'),
  totalOpex: doublePrecision('total_opex'),
  gAndAExpense: doublePrecision('g_and_a_expense'),
  revenue: doublePrecision('revenue'),
  sharesCurrent: bigint('shares_current', { mode: 'number' }),
  shares1YrAgo: bigint('shares_1yr_ago', { mode: 'number' }),
  insiderShares: bigint('insider_shares', { mode: 'number' }),
  totalShares: bigint('total_shares', { mode: 'number' }),
  avgVol30d: doublePrecision('avg_vol_30d'),
  daysSinceLastPr: integer('days_since_last_pr'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('financial_data_stock_id_idx').on(table.stockId),
}));
