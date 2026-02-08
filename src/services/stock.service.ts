import { eq, ilike, or, sql, asc, desc, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, executives, filings, watchlistItems } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';
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

export interface StockDetail {
  stock: typeof stocks.$inferSelect;
  executives_summary: {
    total: number;
    top: (typeof executives.$inferSelect)[];
  };
  recent_filings: (typeof filings.$inferSelect)[];
  is_favorite: boolean;
}

export async function getStockByTicker(ticker: string, userId: string): Promise<StockDetail> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Get stock by ticker
  const stockResults = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  const stock = stockResults[0];
  if (!stock) {
    throw new NotFoundError(`Stock with ticker '${ticker}' not found`);
  }

  // Get executives count and top 3
  const [allExecutives, execCountResult] = await Promise.all([
    db
      .select()
      .from(executives)
      .where(eq(executives.stockId, stock.id))
      .orderBy(desc(executives.yearsAtCompany))
      .limit(3),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(executives)
      .where(eq(executives.stockId, stock.id)),
  ]);

  const execTotal = execCountResult[0]?.count ?? 0;

  // Get recent filings (last 5)
  const recentFilings = await db
    .select()
    .from(filings)
    .where(eq(filings.stockId, stock.id))
    .orderBy(desc(filings.date))
    .limit(5);

  // Check if stock is in user's watchlist
  const watchlistResult = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.userId, userId),
        eq(watchlistItems.stockId, stock.id)
      )
    )
    .limit(1);

  const isFavorite = watchlistResult.length > 0;

  return {
    stock,
    executives_summary: {
      total: execTotal,
      top: allExecutives,
    },
    recent_filings: recentFilings,
    is_favorite: isFavorite,
  };
}
