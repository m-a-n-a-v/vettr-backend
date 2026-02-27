import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  portfolioInsights,
  portfolioHoldings,
  portfolios,
  stocks,
} from '../db/schema/index.js';
import * as cache from './cache.service.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

// --- Types ---

export interface InsightDto {
  id: string;
  portfolio_id: string;
  holding_id: string | null;
  insight_type: string;
  severity: string;
  title: string;
  summary: string;
  data: unknown;
  is_dismissed: boolean;
  expires_at: string | null;
  created_at: string;
}

// --- Constants ---

const INSIGHTS_CACHE_TTL = 10 * 60; // 10 minutes

// --- Queries ---

export async function getPortfolioInsights(
  userId: string,
  portfolioId: string
): Promise<InsightDto[]> {
  if (!db) throw new InternalError('Database not available');

  // Verify ownership
  const portfolio = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
    .limit(1);

  if (portfolio.length === 0) {
    throw new NotFoundError('Portfolio not found');
  }

  const cacheKey = `insights:${portfolioId}`;
  const cached = await cache.get<InsightDto[]>(cacheKey);
  if (cached) return cached;

  const items = await db
    .select()
    .from(portfolioInsights)
    .where(
      and(
        eq(portfolioInsights.portfolioId, portfolioId),
        eq(portfolioInsights.isDismissed, false)
      )
    )
    .orderBy(desc(portfolioInsights.createdAt));

  const result = items.map(toInsightDto);
  await cache.set(cacheKey, result, INSIGHTS_CACHE_TTL);

  return result;
}

export async function getAllUserInsights(userId: string): Promise<InsightDto[]> {
  if (!db) throw new InternalError('Database not available');

  const userPortfolios = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.userId, userId));

  if (userPortfolios.length === 0) return [];

  const portfolioIds = userPortfolios.map((p) => p.id);

  const items = await db
    .select()
    .from(portfolioInsights)
    .where(
      and(
        sql`${portfolioInsights.portfolioId} IN ${portfolioIds}`,
        eq(portfolioInsights.isDismissed, false)
      )
    )
    .orderBy(desc(portfolioInsights.createdAt));

  return items.map(toInsightDto);
}

export async function dismissInsight(userId: string, insightId: string) {
  if (!db) throw new InternalError('Database not available');

  // Verify ownership through portfolio
  const insight = await db
    .select({
      id: portfolioInsights.id,
      portfolioId: portfolioInsights.portfolioId,
    })
    .from(portfolioInsights)
    .where(eq(portfolioInsights.id, insightId))
    .limit(1);

  if (insight.length === 0) {
    throw new NotFoundError('Insight not found');
  }

  const portfolio = await db
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, insight[0]!.portfolioId),
        eq(portfolios.userId, userId)
      )
    )
    .limit(1);

  if (portfolio.length === 0) {
    throw new NotFoundError('Insight not found');
  }

  await db
    .update(portfolioInsights)
    .set({ isDismissed: true })
    .where(eq(portfolioInsights.id, insightId));

  // Invalidate cache
  await cache.del(`insights:${insight[0]!.portfolioId}`);

  return { dismissed: true };
}

/**
 * Generate insights for a portfolio. Called by cron or on-demand.
 * Analyzes holdings and creates insight records for each relevant module.
 */
export async function generateInsights(portfolioId: string): Promise<number> {
  if (!db) throw new InternalError('Database not available');

  const holdings = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.portfolioId, portfolioId));

  if (holdings.length === 0) return 0;

  let insightsCreated = 0;

  // Only analyze VETTR coverage holdings for detailed insights
  const vettrHoldings = holdings.filter((h) => h.assetCategory === 'vettr_coverage' && h.stockId);

  for (const holding of vettrHoldings) {
    // Cash runway check
    const cashInsight = await checkCashRunway(portfolioId, holding);
    if (cashInsight) insightsCreated++;

    // Warrant overhang check
    const warrantInsight = await checkWarrantOverhang(portfolioId, holding);
    if (warrantInsight) insightsCreated++;
  }

  // Portfolio-level insights
  const concentrationInsight = await checkConcentration(portfolioId, holdings);
  if (concentrationInsight) insightsCreated++;

  // Invalidate cache
  await cache.del(`insights:${portfolioId}`);

  return insightsCreated;
}

// --- Insight Generators ---

async function checkCashRunway(
  portfolioId: string,
  holding: any
): Promise<boolean> {
  if (!db) return false;

  // Check if stock has financial data indicating low cash runway
  // This is a simplified check - in production, would query financial_statements
  try {
    const stock = await db
      .select()
      .from(stocks)
      .where(eq(stocks.id, holding.stockId))
      .limit(1);

    if (stock.length === 0) return false;

    // Placeholder: in production, analyze cash burn rate from financial statements
    // For now, flag stocks with very low market cap as potential cash concerns
    const marketCap = stock[0]!.marketCap ?? 0;
    if (marketCap > 0 && marketCap < 10000000) { // < $10M market cap
      await db.insert(portfolioInsights).values({
        portfolioId,
        holdingId: holding.id,
        insightType: 'cash_runway',
        severity: 'warning',
        title: `Low market cap alert: ${holding.ticker}`,
        summary: `${holding.ticker} has a market cap under $10M, which may indicate cash runway concerns. Review recent financials.`,
        data: { marketCap, ticker: holding.ticker },
      });
      return true;
    }
  } catch (err) {
    console.error(`Cash runway check failed for ${holding.ticker}:`, err);
  }

  return false;
}

async function checkWarrantOverhang(
  portfolioId: string,
  holding: any
): Promise<boolean> {
  // Placeholder for warrant overhang detection
  // Would need warrant data from corporate events or insider data
  return false;
}

async function checkConcentration(
  portfolioId: string,
  holdings: any[]
): Promise<boolean> {
  if (!db) return false;

  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
  if (totalValue === 0) return false;

  // Check if any single holding is > 40% of portfolio
  for (const h of holdings) {
    const pct = ((h.currentValue ?? 0) / totalValue) * 100;
    if (pct > 40) {
      await db.insert(portfolioInsights).values({
        portfolioId,
        holdingId: h.id,
        insightType: 'cash_runway', // reusing type for concentration warning
        severity: 'info',
        title: `Concentration risk: ${h.ticker}`,
        summary: `${h.ticker} represents ${Math.round(pct)}% of your portfolio. Consider diversification.`,
        data: { ticker: h.ticker, pct: Math.round(pct) },
      });
      return true;
    }
  }

  return false;
}

// --- Helpers ---

function toInsightDto(item: any): InsightDto {
  return {
    id: item.id,
    portfolio_id: item.portfolioId,
    holding_id: item.holdingId,
    insight_type: item.insightType,
    severity: item.severity,
    title: item.title,
    summary: item.summary,
    data: item.data,
    is_dismissed: item.isDismissed,
    expires_at: item.expiresAt?.toISOString() ?? null,
    created_at: item.createdAt?.toISOString() ?? '',
  };
}
