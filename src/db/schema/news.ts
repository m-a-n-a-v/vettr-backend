import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Stock news table - stores news articles related to a stock
 * Source: TMX news feed
 * One row per article per stock
 */
export const stockNews = pgTable('stock_news', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  headline: varchar('headline', { length: 1000 }).notNull(),
  summary: text('summary'),
  source: varchar('source', { length: 255 }),                 // "GlobeNewswire via QuoteMedia"
  publishedAt: timestamp('published_at').notNull(),
  url: varchar('url', { length: 1000 }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('stock_news_stock_id_idx').on(table.stockId),
  publishedAtIdx: index('stock_news_published_at_idx').on(table.publishedAt),
}));
