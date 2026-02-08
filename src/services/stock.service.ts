import { eq, ilike, or, sql, asc, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';
import type { PaginationMeta } from '../types/pagination.js';

export interface GetStocksOptions {
  limit: number;
  offset: number;
  sector?: string;
  exchange?: string;
  sort?: 'ticker' | 'name' | 'vetr_score' | 'market_cap' | 'price';
  order?: 'asc' | 'desc';
  search?: string;
}

export interface GetStocksResult {
  stocks: (typeof stocks.$inferSelect)[];
  pagination: PaginationMeta;
}

const sortColumnMap = {
  ticker: stocks.ticker,
  name: stocks.name,
  vetr_score: stocks.vetrScore,
  market_cap: stocks.marketCap,
  price: stocks.price,
} as const;

export async function getStocks(options: GetStocksOptions): Promise<GetStocksResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const { limit, offset, sector, exchange, sort = 'ticker', order = 'asc', search } = options;

  // Build WHERE conditions
  const conditions = [];

  if (sector) {
    conditions.push(eq(stocks.sector, sector));
  }

  if (exchange) {
    conditions.push(eq(stocks.exchange, exchange));
  }

  if (search) {
    conditions.push(
      or(
        ilike(stocks.name, `%${search}%`),
        ilike(stocks.ticker, `%${search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stocks)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Build sort
  const sortColumn = sortColumnMap[sort] ?? stocks.ticker;
  const orderFn = order === 'desc' ? desc(sortColumn) : asc(sortColumn);

  // Get paginated results
  const results = await db
    .select()
    .from(stocks)
    .where(whereClause)
    .orderBy(orderFn)
    .limit(limit)
    .offset(offset);

  return {
    stocks: results,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}
