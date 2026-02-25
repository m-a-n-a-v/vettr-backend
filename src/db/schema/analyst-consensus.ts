import { pgTable, uuid, varchar, doublePrecision, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Analyst consensus table - stores aggregate analyst ratings and price targets
 * Sources: TMX analysts, Yahoo recommendationTrend
 * One row per stock, upserted on each refresh
 */
export const analystConsensus = pgTable('analyst_consensus', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  // Consensus counts (TMX)
  totalAnalysts: integer('total_analysts'),
  buyCount: integer('buy_count'),
  holdCount: integer('hold_count'),
  sellCount: integer('sell_count'),
  consensus: varchar('consensus', { length: 20 }),            // "Buy", "Hold", "Sell"

  // Price targets (TMX)
  priceTarget: doublePrecision('price_target'),
  priceTargetHigh: doublePrecision('price_target_high'),
  priceTargetLow: doublePrecision('price_target_low'),

  // Detailed recommendation trend (Yahoo) - monthly breakdown
  // Array of { period, strongBuy, buy, hold, sell, strongSell }
  recommendationTrend: jsonb('recommendation_trend').$type<{
    period: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  }[]>(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('analyst_consensus_stock_id_idx').on(table.stockId),
}));
