import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { portfolios } from './portfolios.js';
import { portfolioHoldings } from './portfolio-holdings.js';

/**
 * Portfolio Insights table - stores AI-generated insight results per portfolio/holding.
 *
 * Six insight types from the lifecycle doc:
 * 1. warrant_overhang - Dilution ceilings from in-the-money warrants
 * 2. cash_runway - Months of cash remaining, alert when < 6 months
 * 3. sedi_insider - Significant insider buying/selling signals
 * 4. hold_expiry - 4-month hold period expiry approaching
 * 5. flow_through - Flow-through share tax-loss selling seasonality
 * 6. executive_pedigree - Management track record concerns
 */
export const portfolioInsights = pgTable('portfolio_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  holdingId: uuid('holding_id')
    .references(() => portfolioHoldings.id, { onDelete: 'cascade' }), // null for portfolio-level insights
  insightType: varchar('insight_type', { length: 30 }).notNull(), // 'warrant_overhang' | 'cash_runway' | 'sedi_insider' | 'hold_expiry' | 'flow_through' | 'executive_pedigree'
  severity: varchar('severity', { length: 20 }).notNull().default('info'), // 'info' | 'warning' | 'critical'
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary').notNull(),
  data: jsonb('data'), // structured insight-specific data
  isDismissed: boolean('is_dismissed').notNull().default(false),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  portfolioIdIdx: index('portfolio_insights_portfolio_id_idx').on(table.portfolioId),
  holdingIdIdx: index('portfolio_insights_holding_id_idx').on(table.holdingId),
  insightTypeIdx: index('portfolio_insights_type_idx').on(table.insightType),
  severityIdx: index('portfolio_insights_severity_idx').on(table.severity),
}));
