import { pgTable, uuid, varchar, doublePrecision, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Financial statements - normalized storage for income statement, balance sheet, cash flow.
 * Each row is one (stock, statement, period, date, line item) = value.
 * Sources: Yahoo incomeStatementHistory, balanceSheetHistory, cashflowStatementHistory.
 */
export const financialStatements = pgTable('financial_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),

  // 'income', 'balance_sheet', 'cash_flow'
  statementType: varchar('statement_type', { length: 20 }).notNull(),

  // 'annual', 'quarterly'
  periodType: varchar('period_type', { length: 10 }).notNull(),

  // The fiscal date for this period (e.g., 2024-12-31)
  fiscalDate: date('fiscal_date').notNull(),

  // The line item name (camelCase from Yahoo, e.g., 'totalRevenue', 'netIncome')
  lineItem: varchar('line_item', { length: 100 }).notNull(),

  // The numeric value
  value: doublePrecision('value'),

  // Currency for this statement
  currency: varchar('currency', { length: 10 }),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueLineItem: uniqueIndex('fs_stock_stmt_period_date_item_idx')
    .on(table.stockId, table.statementType, table.periodType, table.fiscalDate, table.lineItem),
  stockIdIdx: index('financial_statements_stock_id_idx').on(table.stockId),
  stmtTypeIdx: index('financial_statements_stmt_type_idx').on(table.statementType, table.periodType),
}));
