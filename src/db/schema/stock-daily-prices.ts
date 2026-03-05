import { pgTable, uuid, varchar, doublePrecision, date, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Stock Daily Prices - Historical OHLC data for ATR calculation
 * Stores daily Open/High/Low/Close + True Range for 14-day ATR (Wilder's smoothing)
 * Used by the Hourly Action Overlay to compute volatility-adjusted Z-scores
 */
export const stockDailyPrices = pgTable('stock_daily_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  date: date('date').notNull(),
  open: doublePrecision('open'),
  high: doublePrecision('high'),
  low: doublePrecision('low'),
  close: doublePrecision('close'),
  previousClose: doublePrecision('previous_close'),
  volume: doublePrecision('volume'),
  trueRange: doublePrecision('true_range'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tickerIdx: index('stock_daily_prices_ticker_idx').on(table.ticker),
  tickerDateIdx: index('stock_daily_prices_ticker_date_idx').on(table.ticker, table.date),
  tickerDateUnique: unique('stock_daily_prices_ticker_date_unique').on(table.ticker, table.date),
}));
