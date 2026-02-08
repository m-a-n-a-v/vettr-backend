import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<Record<string, any>>().notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
