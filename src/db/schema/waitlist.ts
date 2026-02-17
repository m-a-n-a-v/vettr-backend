import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

/**
 * Waitlist table - stores email signups for the app launch waitlist
 */
export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  source: varchar('source', { length: 100 }).default('marketing_site'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
