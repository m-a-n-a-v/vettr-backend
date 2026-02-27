import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Portfolios table - stores user portfolio connections (Flinks, SnapTrade, CSV, manual)
 * Each user can have multiple portfolio connections from different sources.
 */
export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  connectionType: varchar('connection_type', { length: 20 }).notNull(), // 'flinks' | 'snaptrade' | 'csv_upload' | 'manual'
  connectionId: varchar('connection_id', { length: 255 }), // external provider ID
  connectionStatus: varchar('connection_status', { length: 20 }).notNull().default('active'), // 'active' | 'disconnected' | 'error' | 'pending'
  institutionName: varchar('institution_name', { length: 255 }), // e.g., "Wealthsimple", "Questrade"
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('portfolios_user_id_idx').on(table.userId),
}));
