import { pgTable, uuid, varchar, doublePrecision, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Insider holdings table - current insider positions
 * Source: Yahoo insiderHolders
 * One row per insider per stock
 */
export const insiderHoldings = pgTable('insider_holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  name: varchar('name', { length: 255 }).notNull(),
  relation: varchar('relation', { length: 100 }),             // "Director of Issuer", "Senior Officer of Issuer"
  latestTransDate: timestamp('latest_trans_date'),
  transactionDescription: varchar('transaction_description', { length: 255 }),

  positionDirect: bigint('position_direct', { mode: 'number' }),
  positionDirectDate: timestamp('position_direct_date'),
  positionIndirect: bigint('position_indirect', { mode: 'number' }),
  positionIndirectDate: timestamp('position_indirect_date'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('insider_holdings_stock_id_idx').on(table.stockId),
  nameIdx: index('insider_holdings_name_idx').on(table.name),
}));

/**
 * Insider transactions table - individual buy/sell/exercise transactions
 * Source: Yahoo insiderTransactions
 * One row per transaction
 */
export const insiderTransactions = pgTable('insider_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  filerName: varchar('filer_name', { length: 255 }).notNull(),
  filerRelation: varchar('filer_relation', { length: 100 }),
  transactionDate: timestamp('transaction_date').notNull(),
  transactionText: varchar('transaction_text', { length: 500 }),
  ownership: varchar('ownership', { length: 5 }),             // "D" (direct) or "I" (indirect)
  shares: bigint('shares', { mode: 'number' }),
  value: doublePrecision('value'),                            // transaction dollar value

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('insider_transactions_stock_id_idx').on(table.stockId),
  dateIdx: index('insider_transactions_date_idx').on(table.transactionDate),
}));
