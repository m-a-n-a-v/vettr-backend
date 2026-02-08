import { pgTable, uuid, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { stocks } from './stocks.js';

/**
 * Watchlist Items Table
 *
 * Stores user watchlists with many-to-many relationship between users and stocks.
 * Uses composite primary key (user_id + stock_id) to ensure uniqueness.
 * Tier limits enforced at service layer: FREE=5, PRO=25, PREMIUM=unlimited.
 */
export const watchlistItems = pgTable(
  'watchlist_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: uuid('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (table) => ({
    // Composite primary key ensures one watchlist entry per user per stock
    pk: primaryKey({ columns: [table.userId, table.stockId] }),
    // Index on userId for efficient "get user's watchlist" queries
    userIdIdx: index('watchlist_items_user_id_idx').on(table.userId),
  })
);
