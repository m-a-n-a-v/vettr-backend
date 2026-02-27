import { eq, desc, sql, and, gte, lte, like } from 'drizzle-orm';
import { db } from '../config/database.js';
import { newsArticles, filingCalendar } from '../db/schema/index.js';
import * as cache from './cache.service.js';
import { InternalError } from '../utils/errors.js';

// --- Types ---

export interface NewsArticleDto {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  published_at: string;
  tickers: string[];
  sectors: string[];
  is_material: boolean;
}

export interface FilingCalendarDto {
  id: string;
  stock_id: string | null;
  ticker: string;
  company_name: string;
  filing_type: string;
  expected_date: string;
  actual_date: string | null;
  source_url: string | null;
  status: string;
}

// --- Constants ---

const NEWS_CACHE_TTL = 5 * 60; // 5 minutes

// --- News Queries ---

export async function getNewsArticles(options: {
  source?: string;
  ticker?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NewsArticleDto[]; total: number }> {
  if (!db) throw new InternalError('Database not available');

  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const cacheKey = `news:${options.source ?? 'all'}:${options.ticker ?? 'all'}:${limit}:${offset}`;
  const cached = await cache.get<{ items: NewsArticleDto[]; total: number }>(cacheKey);
  if (cached) return cached;

  const conditions = [];

  if (options.source) {
    conditions.push(eq(newsArticles.source, options.source));
  }

  if (options.ticker) {
    // Search for ticker in comma-separated tickers field
    conditions.push(
      sql`${newsArticles.tickers} LIKE ${'%' + options.ticker.toUpperCase() + '%'}`
    );
  }

  const whereClause = conditions.length > 0
    ? and(...conditions)
    : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(newsArticles)
      .where(whereClause)
      .orderBy(desc(newsArticles.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(newsArticles)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const result = {
    items: items.map(toNewsDto),
    total,
  };

  await cache.set(cacheKey, result, NEWS_CACHE_TTL);

  return result;
}

export async function getMaterialNews(limit: number = 10): Promise<NewsArticleDto[]> {
  if (!db) throw new InternalError('Database not available');

  const cacheKey = `news:material:${limit}`;
  const cached = await cache.get<NewsArticleDto[]>(cacheKey);
  if (cached) return cached;

  const items = await db
    .select()
    .from(newsArticles)
    .where(eq(newsArticles.isMaterial, true))
    .orderBy(desc(newsArticles.publishedAt))
    .limit(limit);

  const result = items.map(toNewsDto);
  await cache.set(cacheKey, result, NEWS_CACHE_TTL);

  return result;
}

export async function getNewsForTickers(tickers: string[]): Promise<NewsArticleDto[]> {
  if (!db) throw new InternalError('Database not available');
  if (tickers.length === 0) return [];

  // Build OR conditions for each ticker in the comma-separated field
  const tickerConditions = tickers.map(
    (t) => sql`${newsArticles.tickers} LIKE ${'%' + t.toUpperCase() + '%'}`
  );

  const items = await db
    .select()
    .from(newsArticles)
    .where(sql`(${sql.join(tickerConditions, sql` OR `)})`)
    .orderBy(desc(newsArticles.publishedAt))
    .limit(50);

  return items.map(toNewsDto);
}

// --- Filing Calendar ---

export async function getUpcomingFilings(options: {
  ticker?: string;
  status?: string;
  days?: number;
  limit?: number;
}): Promise<FilingCalendarDto[]> {
  if (!db) throw new InternalError('Database not available');

  const limit = options.limit ?? 20;
  const conditions = [];

  if (options.ticker) {
    conditions.push(eq(filingCalendar.ticker, options.ticker.toUpperCase()));
  }

  if (options.status) {
    conditions.push(eq(filingCalendar.status, options.status));
  }

  if (options.days) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + options.days);
    conditions.push(lte(filingCalendar.expectedDate, futureDate.toISOString().split('T')[0]!));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(filingCalendar)
    .where(whereClause)
    .orderBy(filingCalendar.expectedDate)
    .limit(limit);

  return items.map(toFilingDto);
}

export async function getOverdueFilings(): Promise<FilingCalendarDto[]> {
  if (!db) throw new InternalError('Database not available');

  const items = await db
    .select()
    .from(filingCalendar)
    .where(eq(filingCalendar.status, 'overdue'))
    .orderBy(filingCalendar.expectedDate)
    .limit(50);

  return items.map(toFilingDto);
}

// --- Helpers ---

function toNewsDto(article: any): NewsArticleDto {
  return {
    id: article.id,
    source: article.source,
    source_url: article.sourceUrl,
    title: article.title,
    summary: article.summary,
    content: article.content,
    image_url: article.imageUrl,
    published_at: article.publishedAt?.toISOString() ?? '',
    tickers: article.tickers ? article.tickers.split(',').map((t: string) => t.trim()) : [],
    sectors: article.sectors ? article.sectors.split(',').map((s: string) => s.trim()) : [],
    is_material: article.isMaterial,
  };
}

function toFilingDto(filing: any): FilingCalendarDto {
  return {
    id: filing.id,
    stock_id: filing.stockId,
    ticker: filing.ticker,
    company_name: filing.companyName,
    filing_type: filing.filingType,
    expected_date: filing.expectedDate,
    actual_date: filing.actualDate,
    source_url: filing.sourceUrl,
    status: filing.status,
  };
}
