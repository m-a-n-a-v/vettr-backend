import { pgTable, uuid, varchar, integer, doublePrecision, timestamp, index, unique } from 'drizzle-orm/pg-core';

/**
 * VETR Score Snapshots - Hourly time-series table
 * Optimized for charting and trend analysis with exactly one row per ticker per hour
 */
export const vetrScoreSnapshots = pgTable('vetr_score_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockTicker: varchar('stock_ticker', { length: 20 }).notNull(),
  overallScore: integer('overall_score').notNull(),

  // 4 Pillar Scores
  financialSurvivalScore: integer('financial_survival_score').notNull().default(0),
  operationalEfficiencyScore: integer('operational_efficiency_score').notNull().default(0),
  shareholderStructureScore: integer('shareholder_structure_score').notNull().default(0),
  marketSentimentScore: integer('market_sentiment_score').notNull().default(0),

  // Stock price snapshot at this hour (nullable)
  price: doublePrecision('price'),

  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
}, (table) => ({
  // Composite index for fast time-series queries per ticker
  tickerTimeIdx: index('vetr_score_snapshots_ticker_time_idx').on(table.stockTicker, table.recordedAt.desc()),
  // Index for retention cleanup queries
  recordedAtIdx: index('vetr_score_snapshots_recorded_at_idx').on(table.recordedAt),
  // Unique constraint to enable upsert (one row per ticker per hour)
  tickerTimeUnique: unique('vetr_score_snapshots_ticker_time_unique').on(table.stockTicker, table.recordedAt),
}));
