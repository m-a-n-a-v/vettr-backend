import { pgTable, uuid, varchar, integer, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';

export const vetrScoreHistory = pgTable('vetr_score_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockTicker: varchar('stock_ticker', { length: 20 }).notNull(),
  overallScore: integer('overall_score').notNull(),

  // 4 Pillar Scores (not null, default 0)
  financialSurvivalScore: integer('financial_survival_score').notNull().default(0),
  operationalEfficiencyScore: integer('operational_efficiency_score').notNull().default(0),
  shareholderStructureScore: integer('shareholder_structure_score').notNull().default(0),
  marketSentimentScore: integer('market_sentiment_score').notNull().default(0),

  // Sub-scores (nullable)
  cashRunwayScore: integer('cash_runway_score'),
  solvencyScore: integer('solvency_score'),
  efficiencyScore: integer('efficiency_score'),
  pedigreeSubScore: integer('pedigree_sub_score'),
  dilutionPenaltyScore: integer('dilution_penalty_score'),
  insiderAlignmentScore: integer('insider_alignment_score'),
  liquidityScore: integer('liquidity_score'),
  newsVelocityScore: integer('news_velocity_score'),

  // Pillar Weights (nullable)
  p1Weight: doublePrecision('p1_weight'),
  p2Weight: doublePrecision('p2_weight'),
  p3Weight: doublePrecision('p3_weight'),
  p4Weight: doublePrecision('p4_weight'),

  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
}, (table) => ({
  stockTickerIdx: index('vetr_score_history_stock_ticker_idx').on(table.stockTicker),
  calculatedAtIdx: index('vetr_score_history_calculated_at_idx').on(table.calculatedAt),
}));
