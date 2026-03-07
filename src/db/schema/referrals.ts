import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Referrals table - tracks referral relationships between users
 * Discount tiers: 1-2 referrals = 10%, 3-5 = 20%, 6+ = 30%
 */
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerUserId: uuid('referrer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  referredUserId: uuid('referred_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  referralCode: varchar('referral_code', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('completed'),
  discountApplied: varchar('discount_applied', { length: 10 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
