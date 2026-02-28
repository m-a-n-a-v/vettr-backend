import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Device Tokens table - stores FCM tokens for push notification delivery.
 * Each user can have multiple devices (iOS, Android, Web).
 * Tokens are registered on login and unregistered on logout.
 * Stale tokens are automatically marked inactive when FCM reports them invalid.
 */
export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 10 }).notNull(), // 'ios' | 'android' | 'web'
  token: varchar('token', { length: 512 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('device_tokens_user_id_idx').on(table.userId),
  tokenUniqueIdx: uniqueIndex('device_tokens_token_unique_idx').on(table.token),
  platformIdx: index('device_tokens_platform_idx').on(table.platform),
}));
