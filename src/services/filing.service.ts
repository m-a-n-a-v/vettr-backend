import { eq, sql, desc, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { filings, filingReads, stocks } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';
import type { PaginationMeta } from '../types/pagination.js';

export interface GetFilingsOptions {
  limit: number;
  offset: number;
}

export interface GetFilingsByStockOptions {
  limit: number;
  offset: number;
  type?: string;
}

export interface FilingWithStock {
  filing: typeof filings.$inferSelect;
  stock_ticker: string;
  stock_name: string;
}

export interface GetLatestFilingsResult {
  filings: FilingWithStock[];
  pagination: PaginationMeta;
}

export interface GetFilingsByStockResult {
  filings: (typeof filings.$inferSelect)[];
  pagination: PaginationMeta;
}

export interface FilingDetail {
  filing: typeof filings.$inferSelect;
  is_read: boolean;
}

export async function getLatestFilings(options: GetFilingsOptions): Promise<GetLatestFilingsResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const { limit, offset } = options;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(filings);

  const total = countResult[0]?.count ?? 0;

  // Get paginated filings with stock info, ordered by date descending
  const results = await db
    .select({
      filing: filings,
      stock_ticker: stocks.ticker,
      stock_name: stocks.name,
    })
    .from(filings)
    .innerJoin(stocks, eq(filings.stockId, stocks.id))
    .orderBy(desc(filings.date))
    .limit(limit)
    .offset(offset);

  return {
    filings: results,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}

export async function getFilingsByStock(
  stockId: string,
  options: GetFilingsByStockOptions
): Promise<GetFilingsByStockResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const { limit, offset, type } = options;

  // Build WHERE conditions
  const conditions = [eq(filings.stockId, stockId)];

  if (type) {
    conditions.push(eq(filings.type, type));
  }

  const whereClause = conditions.length === 1
    ? conditions[0]
    : and(...conditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(filings)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Get paginated filings ordered by date descending
  const results = await db
    .select()
    .from(filings)
    .where(whereClause)
    .orderBy(desc(filings.date))
    .limit(limit)
    .offset(offset);

  return {
    filings: results,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}

export async function getFilingById(filingId: string, userId: string): Promise<FilingDetail> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Get filing
  const filingResults = await db
    .select()
    .from(filings)
    .where(eq(filings.id, filingId))
    .limit(1);

  const filing = filingResults[0];
  if (!filing) {
    throw new NotFoundError(`Filing with id '${filingId}' not found`);
  }

  // Check if user has read this filing
  const readResult = await db
    .select()
    .from(filingReads)
    .where(
      and(
        eq(filingReads.userId, userId),
        eq(filingReads.filingId, filingId)
      )
    )
    .limit(1);

  const isRead = readResult.length > 0;

  return {
    filing,
    is_read: isRead,
  };
}

export async function markAsRead(filingId: string, userId: string): Promise<void> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Verify filing exists
  const filingResults = await db
    .select({ id: filings.id })
    .from(filings)
    .where(eq(filings.id, filingId))
    .limit(1);

  if (filingResults.length === 0) {
    throw new NotFoundError(`Filing with id '${filingId}' not found`);
  }

  // Upsert into filing_reads (idempotent - marking as read again is a no-op)
  await db
    .insert(filingReads)
    .values({
      userId,
      filingId,
    })
    .onConflictDoNothing();
}
