import { pgTable, uuid, varchar, date, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Filing Calendar table - tracks expected and actual filing dates.
 * Used to display upcoming filings and flag overdue submissions.
 */
export const filingCalendar = pgTable('filing_calendar', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id')
    .references(() => stocks.id, { onDelete: 'cascade' }),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  filingType: varchar('filing_type', { length: 100 }).notNull(), // 'Annual Report', 'Quarterly', 'Material Change', etc.
  expectedDate: date('expected_date').notNull(),
  actualDate: date('actual_date'),
  sourceUrl: varchar('source_url', { length: 1024 }),
  status: varchar('status', { length: 20 }).notNull().default('upcoming'), // 'upcoming' | 'filed' | 'overdue'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tickerIdx: index('filing_calendar_ticker_idx').on(table.ticker),
  expectedDateIdx: index('filing_calendar_expected_date_idx').on(table.expectedDate),
  statusIdx: index('filing_calendar_status_idx').on(table.status),
}));
