import { pgTable, uuid, varchar, doublePrecision, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Institutional holders table - stores top institutional and fund ownership data
 * Sources: Yahoo institutionOwnership + fundOwnership
 * Multiple rows per stock (one per holder)
 */
export const institutionalHolders = pgTable('institutional_holders', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  holderType: varchar('holder_type', { length: 20 }).notNull(), // "institution" or "fund"
  organization: varchar('organization', { length: 500 }).notNull(),
  reportDate: timestamp('report_date'),

  pctHeld: doublePrecision('pct_held'),                       // e.g. 0.1144
  position: bigint('position', { mode: 'number' }),           // number of shares
  value: doublePrecision('value'),                            // USD value of position
  pctChange: doublePrecision('pct_change'),                   // change since last report

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('institutional_holders_stock_id_idx').on(table.stockId),
  typeIdx: index('institutional_holders_type_idx').on(table.holderType),
}));

/**
 * Major holders breakdown - aggregate ownership percentages
 * Source: Yahoo majorHoldersBreakdown + netSharePurchaseActivity
 * One row per stock
 */
export const majorHoldersBreakdown = pgTable('major_holders_breakdown', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  insidersPercentHeld: doublePrecision('insiders_percent_held'),
  institutionsPercentHeld: doublePrecision('institutions_percent_held'),
  institutionsFloatPercentHeld: doublePrecision('institutions_float_percent_held'),
  institutionsCount: bigint('institutions_count', { mode: 'number' }),

  // Net share purchase activity (6-month window)
  netBuyCount: bigint('net_buy_count', { mode: 'number' }),
  netSellCount: bigint('net_sell_count', { mode: 'number' }),
  netShares: bigint('net_shares', { mode: 'number' }),
  totalInsiderShares: bigint('total_insider_shares', { mode: 'number' }),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('major_holders_breakdown_stock_id_idx').on(table.stockId),
}));
