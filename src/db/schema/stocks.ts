import { pgTable, uuid, varchar, doublePrecision, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const stocks = pgTable('stocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticker: varchar('ticker', { length: 20 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),
  sector: varchar('sector', { length: 100 }).notNull(),
  marketCap: doublePrecision('market_cap'),
  price: doublePrecision('price'),
  priceChange: doublePrecision('price_change'),
  vetrScore: integer('vetr_score'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tickerIdx: index('stocks_ticker_idx').on(table.ticker),
  sectorIdx: index('stocks_sector_idx').on(table.sector),
  exchangeIdx: index('stocks_exchange_idx').on(table.exchange),
}));
