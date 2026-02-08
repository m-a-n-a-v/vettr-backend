import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const vetrScoreHistory = pgTable('vetr_score_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockTicker: varchar('stock_ticker', { length: 20 }).notNull(),
  overallScore: integer('overall_score').notNull(),
  pedigreeScore: integer('pedigree_score').notNull(),
  filingVelocityScore: integer('filing_velocity_score').notNull(),
  redFlagScore: integer('red_flag_score').notNull(),
  growthScore: integer('growth_score').notNull(),
  governanceScore: integer('governance_score').notNull(),
  bonusPoints: integer('bonus_points').notNull().default(0),
  penaltyPoints: integer('penalty_points').notNull().default(0),
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
}, (table) => ({
  stockTickerIdx: index('vetr_score_history_stock_ticker_idx').on(table.stockTicker),
  calculatedAtIdx: index('vetr_score_history_calculated_at_idx').on(table.calculatedAt),
}));
