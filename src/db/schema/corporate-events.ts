import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Corporate events table - stores upcoming and past corporate events
 * Sources: TMX events (WallStreetHorizon), Yahoo calendarEvents
 * Types: EAD (Earnings Announcement), ECC (Earnings Call), PRD (Production Update), CON (Conference)
 */
export const corporateEvents = pgTable('corporate_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  eventType: varchar('event_type', { length: 20 }).notNull(), // "EAD", "ECC", "PRD", "CON"
  eventName: varchar('event_name', { length: 500 }).notNull(),
  eventDate: timestamp('event_date').notNull(),
  eventStatus: varchar('event_status', { length: 20 }),       // "CON" (confirmed), "UNC" (unconfirmed)
  eventUrl: varchar('event_url', { length: 1000 }),
  sourceEventId: varchar('source_event_id', { length: 50 }),  // external ID for dedup

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('corporate_events_stock_id_idx').on(table.stockId),
  dateIdx: index('corporate_events_date_idx').on(table.eventDate),
  typeIdx: index('corporate_events_type_idx').on(table.eventType),
}));
