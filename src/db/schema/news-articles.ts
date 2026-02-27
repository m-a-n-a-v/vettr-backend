import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * News Articles table - aggregated news from multiple sources.
 * Sources: BNN, SEDAR+, TSX market maker, press releases, Globe Investor.
 * Tickers stored as comma-separated string for simplicity (no array column needed).
 */
export const newsArticles = pgTable('news_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: varchar('source', { length: 30 }).notNull(), // 'bnn' | 'sedar' | 'tsx_market_maker' | 'press_release' | 'globe_investor'
  sourceUrl: varchar('source_url', { length: 1024 }),
  title: varchar('title', { length: 500 }).notNull(),
  summary: text('summary'),
  content: text('content'),
  imageUrl: varchar('image_url', { length: 1024 }),
  publishedAt: timestamp('published_at').notNull(),
  tickers: varchar('tickers', { length: 1000 }), // comma-separated: "FPX,ABC,XYZ"
  sectors: varchar('sectors', { length: 500 }), // comma-separated: "Mining,Technology"
  isMaterial: boolean('is_material').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sourceIdx: index('news_articles_source_idx').on(table.source),
  publishedAtIdx: index('news_articles_published_at_idx').on(table.publishedAt),
}));
