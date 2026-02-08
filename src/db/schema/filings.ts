import { pgTable, uuid, varchar, timestamp, text, boolean, index, primaryKey } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';
import { users } from './users.js';

/**
 * Filings table - stores regulatory filings for stocks (MD&A, press releases, financial statements, etc.)
 */
export const filings = pgTable('filings', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id')
    .notNull()
    .references(() => stocks.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 100 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  date: timestamp('date').notNull(),
  summary: text('summary'),
  isMaterial: boolean('is_material').notNull().default(false),
  sourceUrl: varchar('source_url', { length: 1000 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('filings_stock_id_idx').on(table.stockId),
  dateIdx: index('filings_date_idx').on(table.date),
}));

/**
 * Filing reads table - tracks which filings each user has read
 * Uses composite primary key (user_id, filing_id) for per-user read tracking
 */
export const filingReads = pgTable('filing_reads', {
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  filingId: uuid('filing_id')
    .notNull()
    .references(() => filings.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at').notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.filingId] }),
}));
