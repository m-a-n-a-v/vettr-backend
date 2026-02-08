import { pgTable, uuid, timestamp, integer, varchar, text, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const syncHistory = pgTable('sync_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  itemsSynced: integer('items_synced').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull(), // pending, success, failed
  errors: text('errors'),
}, (table) => ({
  userIdIdx: index('sync_history_user_id_idx').on(table.userId),
  startedAtIdx: index('sync_history_started_at_idx').on(table.startedAt),
}));
