import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

/**
 * Company profiles - detailed company information from Yahoo assetProfile + price modules.
 * One row per stock, upserted on each refresh.
 */
export const companyProfiles = pgTable('company_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).unique().notNull(),

  description: text('description'),
  industry: varchar('industry', { length: 255 }),
  subIndustry: varchar('sub_industry', { length: 255 }),
  employees: integer('employees'),
  website: varchar('website', { length: 500 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  zip: varchar('zip', { length: 20 }),
  currency: varchar('currency', { length: 10 }),
  exchangeName: varchar('exchange_name', { length: 100 }),
  quoteType: varchar('quote_type', { length: 50 }),

  // Officers as JSONB array: [{name, title, age, totalPay}]
  officers: jsonb('officers').$type<Array<{
    name: string;
    title: string;
    age?: number;
    totalPay?: number;
  }>>(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('company_profiles_stock_id_idx').on(table.stockId),
}));
