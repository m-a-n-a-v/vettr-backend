import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { portfolios } from './portfolios.js';
import { portfolioHoldings } from './portfolio-holdings.js';

/**
 * Portfolio Alerts table - auto-generated, portfolio-centric alerts.
 * Unlike the old alert_rules system (user-created), these are automatically
 * triggered by the system when critical events are detected for portfolio holdings.
 *
 * Alert types:
 * - insider_buy / insider_sell (SEDI data)
 * - hold_expiry (4-month hold approaching)
 * - cash_runway (< 6 months or < 3 months)
 * - warrant_breach (price crossing warrant strike)
 * - score_change (VETTR score degradation > 10 points)
 * - executive_change (new CEO/CFO appointment)
 * - filing_published (new material filing)
 * - flow_through_warning (seasonal tax-loss window)
 */
export const portfolioAlerts = pgTable('portfolio_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  portfolioId: uuid('portfolio_id')
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  holdingId: uuid('holding_id')
    .references(() => portfolioHoldings.id, { onDelete: 'cascade' }),
  alertType: varchar('alert_type', { length: 30 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('info'), // 'info' | 'warning' | 'critical'
  deepLink: varchar('deep_link', { length: 512 }), // e.g., '/stocks/FPX?tab=red-flags'
  isRead: boolean('is_read').notNull().default(false),
  triggeredAt: timestamp('triggered_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('portfolio_alerts_user_id_idx').on(table.userId),
  portfolioIdIdx: index('portfolio_alerts_portfolio_id_idx').on(table.portfolioId),
  alertTypeIdx: index('portfolio_alerts_type_idx').on(table.alertType),
  triggeredAtIdx: index('portfolio_alerts_triggered_at_idx').on(table.triggeredAt),
  isReadIdx: index('portfolio_alerts_is_read_idx').on(table.isRead),
}));
