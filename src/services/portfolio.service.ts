import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  portfolios,
  portfolioHoldings,
  portfolioSnapshots,
  stocks,
} from '../db/schema/index.js';
import * as cache from './cache.service.js';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors.js';

// --- Types ---

export interface CreatePortfolioInput {
  connectionType: 'flinks' | 'snaptrade' | 'csv' | 'manual';
  connectionId?: string;
  institutionName?: string;
}

export interface AddHoldingInput {
  ticker: string;
  quantity: number;
  averageCost: number;
  assetCategory?: string;
}

export interface PortfolioSummary {
  portfolio_id: string;
  connection_type: string;
  institution_name: string | null;
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  vettr_coverage_value: number;
  vettr_coverage_pct: number;
  holdings_count: number;
  last_synced_at: string | null;
}

export interface CategorizedHoldings {
  vettr_coverage: HoldingDto[];
  large_cap_ca: HoldingDto[];
  global: HoldingDto[];
  alternative: HoldingDto[];
}

export interface HoldingDto {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  average_cost: number | null;
  current_price: number | null;
  current_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  asset_category: string;
  stock_id: string | null;
  currency: string;
  exchange: string | null;
  sector: string | null;
}

// --- Constants ---

const PORTFOLIO_CACHE_TTL = 3 * 60; // 3 minutes

// --- Portfolio CRUD ---

export async function createPortfolio(userId: string, input: CreatePortfolioInput) {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .insert(portfolios)
    .values({
      userId,
      connectionType: input.connectionType,
      connectionId: input.connectionId ?? null,
      institutionName: input.institutionName ?? null,
    })
    .returning();

  return result[0]!;
}

export async function getUserPortfolios(userId: string) {
  if (!db) throw new InternalError('Database not available');

  return db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(desc(portfolios.createdAt));
}

export async function getPortfolioById(userId: string, portfolioId: string) {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Portfolio not found');
  }

  return result[0]!;
}

export async function deletePortfolio(userId: string, portfolioId: string) {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .delete(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('Portfolio not found');
  }

  await cache.del(`portfolio_summary:${userId}`);

  return { deleted: true };
}

// --- Holdings ---

export async function addHolding(userId: string, portfolioId: string, input: AddHoldingInput) {
  if (!db) throw new InternalError('Database not available');

  await getPortfolioById(userId, portfolioId);

  const ticker = input.ticker.toUpperCase();

  // Try to find a matching stock in our coverage universe
  let stockId: string | null = null;
  let holdingName = ticker; // default to ticker
  let currentPrice: number | null = null;
  let assetCategory = input.assetCategory || 'global';
  let exchange: string | null = null;
  let sector: string | null = null;

  const stockResult = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker))
    .limit(1);

  if (stockResult.length > 0) {
    const stock = stockResult[0]!;
    stockId = stock.id;
    holdingName = stock.name;
    currentPrice = stock.price ?? null;
    assetCategory = 'vettr_coverage';
    exchange = stock.exchange;
    sector = stock.sector;
  }

  const currentValue = currentPrice != null ? currentPrice * input.quantity : null;
  const totalCost = input.averageCost * input.quantity;
  const unrealizedPnl = currentValue != null ? currentValue - totalCost : null;
  const unrealizedPnlPct = unrealizedPnl != null && totalCost > 0
    ? ((unrealizedPnl / totalCost) * 100)
    : null;

  const result = await db
    .insert(portfolioHoldings)
    .values({
      portfolioId,
      stockId,
      ticker,
      name: holdingName,
      assetCategory,
      quantity: input.quantity,
      averageCost: input.averageCost,
      currentPrice,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
      exchange,
      sector,
    })
    .returning();

  await cache.del(`portfolio_summary:${userId}`);

  return result[0]!;
}

export async function getPortfolioHoldings(userId: string, portfolioId: string) {
  if (!db) throw new InternalError('Database not available');

  await getPortfolioById(userId, portfolioId);

  const holdings = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.portfolioId, portfolioId))
    .orderBy(desc(portfolioHoldings.currentValue));

  return holdings.map(toHoldingDto);
}

export async function getAllUserHoldings(userId: string): Promise<HoldingDto[]> {
  if (!db) throw new InternalError('Database not available');

  const userPortfolios = await getUserPortfolios(userId);
  if (userPortfolios.length === 0) return [];

  const portfolioIds = userPortfolios.map((p) => p.id);

  const holdings = await db
    .select()
    .from(portfolioHoldings)
    .where(sql`${portfolioHoldings.portfolioId} IN ${portfolioIds}`)
    .orderBy(desc(portfolioHoldings.currentValue));

  return holdings.map(toHoldingDto);
}

export async function getCategorizedHoldings(userId: string): Promise<CategorizedHoldings> {
  const allHoldings = await getAllUserHoldings(userId);

  const categorized: CategorizedHoldings = {
    vettr_coverage: [],
    large_cap_ca: [],
    global: [],
    alternative: [],
  };

  for (const h of allHoldings) {
    const category = h.asset_category as keyof CategorizedHoldings;
    if (categorized[category]) {
      categorized[category].push(h);
    } else {
      categorized.global.push(h);
    }
  }

  return categorized;
}

export async function removeHolding(userId: string, holdingId: string) {
  if (!db) throw new InternalError('Database not available');

  const holding = await db
    .select({ portfolioId: portfolioHoldings.portfolioId })
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.id, holdingId))
    .limit(1);

  if (holding.length === 0) {
    throw new NotFoundError('Holding not found');
  }

  await getPortfolioById(userId, holding[0]!.portfolioId);

  await db
    .delete(portfolioHoldings)
    .where(eq(portfolioHoldings.id, holdingId));

  await cache.del(`portfolio_summary:${userId}`);

  return { deleted: true };
}

// --- Portfolio Summary ---

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary[]> {
  if (!db) throw new InternalError('Database not available');

  const cacheKey = `portfolio_summary:${userId}`;
  const cached = await cache.get<PortfolioSummary[]>(cacheKey);
  if (cached) return cached;

  const userPortfolios = await getUserPortfolios(userId);

  const summaries: PortfolioSummary[] = [];

  for (const portfolio of userPortfolios) {
    const holdings = await db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.portfolioId, portfolio.id));

    let totalValue = 0;
    let totalCost = 0;
    let vettrCoverageValue = 0;

    for (const h of holdings) {
      totalValue += h.currentValue ?? 0;
      totalCost += (h.averageCost ?? 0) * h.quantity;
      if (h.assetCategory === 'vettr_coverage') {
        vettrCoverageValue += h.currentValue ?? 0;
      }
    }

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;
    const vettrCoveragePct = totalValue > 0 ? ((vettrCoverageValue / totalValue) * 100) : 0;

    summaries.push({
      portfolio_id: portfolio.id,
      connection_type: portfolio.connectionType,
      institution_name: portfolio.institutionName,
      total_value: Math.round(totalValue * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      total_pnl: Math.round(totalPnl * 100) / 100,
      total_pnl_pct: Math.round(totalPnlPct * 100) / 100,
      vettr_coverage_value: Math.round(vettrCoverageValue * 100) / 100,
      vettr_coverage_pct: Math.round(vettrCoveragePct * 100) / 100,
      holdings_count: holdings.length,
      last_synced_at: portfolio.lastSyncedAt?.toISOString() ?? null,
    });
  }

  await cache.set(cacheKey, summaries, PORTFOLIO_CACHE_TTL);

  return summaries;
}

// --- Snapshots ---

export async function getPortfolioSnapshots(
  userId: string,
  portfolioId: string,
  days: number = 30
) {
  if (!db) throw new InternalError('Database not available');

  await getPortfolioById(userId, portfolioId);

  const since = new Date();
  since.setDate(since.getDate() - days);

  return db
    .select()
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.portfolioId, portfolioId),
        gte(portfolioSnapshots.recordedAt, since)
      )
    )
    .orderBy(portfolioSnapshots.recordedAt);
}

export async function recordPortfolioSnapshot(portfolioId: string) {
  if (!db) throw new InternalError('Database not available');

  const holdings = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.portfolioId, portfolioId));

  let totalValue = 0;
  let totalCost = 0;
  let vettrCoverageValue = 0;

  for (const h of holdings) {
    totalValue += h.currentValue ?? 0;
    totalCost += (h.averageCost ?? 0) * h.quantity;
    if (h.assetCategory === 'vettr_coverage') {
      vettrCoverageValue += h.currentValue ?? 0;
    }
  }

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;
  const vettrCoveragePct = totalValue > 0 ? ((vettrCoverageValue / totalValue) * 100) : 0;

  return db
    .insert(portfolioSnapshots)
    .values({
      portfolioId,
      totalValue,
      totalCost,
      totalPnl,
      totalPnlPct,
      vettrCoverageValue,
      vettrCoveragePct,
    })
    .returning();
}

// --- CSV Import ---

export async function importHoldingsFromCsv(
  userId: string,
  portfolioId: string,
  rows: Array<{ ticker: string; shares: number; avgCost: number }>
) {
  if (!db) throw new InternalError('Database not available');

  await getPortfolioById(userId, portfolioId);

  if (rows.length === 0) {
    throw new ValidationError('CSV contains no valid rows');
  }

  const results = [];
  for (const row of rows) {
    try {
      const holding = await addHolding(userId, portfolioId, {
        ticker: row.ticker,
        quantity: row.shares,
        averageCost: row.avgCost,
      });
      results.push({ ticker: row.ticker, status: 'added', id: holding.id });
    } catch (err: any) {
      results.push({ ticker: row.ticker, status: 'error', error: err.message });
    }
  }

  return results;
}

// --- Helpers ---

function toHoldingDto(h: any): HoldingDto {
  return {
    id: h.id,
    ticker: h.ticker,
    name: h.name,
    quantity: h.quantity,
    average_cost: h.averageCost,
    current_price: h.currentPrice,
    current_value: h.currentValue,
    unrealized_pnl: h.unrealizedPnl,
    unrealized_pnl_pct: h.unrealizedPnlPct,
    asset_category: h.assetCategory,
    stock_id: h.stockId,
    currency: h.currency,
    exchange: h.exchange,
    sector: h.sector,
  };
}
