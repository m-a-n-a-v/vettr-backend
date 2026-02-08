import { pgTable, uuid, varchar, doublePrecision, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks.js';

export const executives = pgTable(
  'executives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stockId: uuid('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    yearsAtCompany: doublePrecision('years_at_company').notNull(),
    previousCompanies: jsonb('previous_companies').$type<string[]>().default([]),
    education: varchar('education', { length: 500 }),
    specialization: varchar('specialization', { length: 255 }),
    socialLinkedin: varchar('social_linkedin', { length: 500 }),
    socialTwitter: varchar('social_twitter', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    stockIdIdx: index('executives_stock_id_idx').on(table.stockId),
    nameIdx: index('executives_name_idx').on(table.name),
  })
);
