import { pgTable, uuid, varchar, timestamp, date, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * AI Agent Usage tracking table
 * Tracks daily question usage per user to enforce tier-based limits
 * - FREE: 3 questions/day
 * - PRO: 15 questions/day
 * - PREMIUM: unlimited
 */
export const aiAgentUsage = pgTable('ai_agent_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  questionId: varchar('question_id', { length: 50 }).notNull(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  askedAt: timestamp('asked_at').notNull().defaultNow(),
  date: date('date').notNull(),
}, (table) => ({
  userDateIdx: index('ai_agent_usage_user_date_idx').on(table.userId, table.date),
}));
