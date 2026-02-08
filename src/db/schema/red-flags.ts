import { pgTable, uuid, varchar, doublePrecision, text, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const redFlagHistory = pgTable('red_flag_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockTicker: varchar('stock_ticker', { length: 10 }).notNull(),
  flagType: varchar('flag_type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(), // Low, Moderate, High, Critical
  score: doublePrecision('score').notNull(),
  description: text('description').notNull(),
  detectedAt: timestamp('detected_at').notNull().defaultNow(),
}, (table) => ({
  stockTickerIdx: index('red_flag_history_stock_ticker_idx').on(table.stockTicker),
  detectedAtIdx: index('red_flag_history_detected_at_idx').on(table.detectedAt),
  flagTypeIdx: index('red_flag_history_flag_type_idx').on(table.flagType),
}));

export const redFlagAcknowledgments = pgTable('red_flag_acknowledgments', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redFlagId: uuid('red_flag_id').notNull().references(() => redFlagHistory.id, { onDelete: 'cascade' }),
  acknowledgedAt: timestamp('acknowledged_at').notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.redFlagId] }),
}));
