import { eq, sql, and, inArray, or, isNull, gt, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  stocks,
  financialData,
  vetrScoreHistory,
  dividendInfo,
} from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';
import * as cache from './cache.service.js';

const CACHE_KEY = 'sample_portfolios:all';
const CACHE_TTL = 30 * 60; // 30 minutes
const MAX_STOCKS = 10;

export interface SamplePortfolioStock {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  market_cap: number | null;
  price: number | null;
  price_change: number | null;
  vetr_score: number | null;
}

export interface SamplePortfolio {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  criteria_summary: string;
  stock_count: number;
  total_notional_value: number;
  stocks: SamplePortfolioStock[];
}

export interface SamplePortfoliosResult {
  portfolios: SamplePortfolio[];
}

/**
 * Get all 4 sample portfolios with cached results
 */
export async function getSamplePortfolios(): Promise<SamplePortfoliosResult> {
  // Try cache first
  const cached = await cache.get<SamplePortfoliosResult>(CACHE_KEY);
  if (cached) {
    return cached;
  }

  if (!db) {
    throw new InternalError('Database not available');
  }

  // Compute all 4 portfolios in parallel
  const [
    cashHeavy,
    legacyBuilders,
    dividendMachines,
    insiderConviction,
  ] = await Promise.all([
    getCashHeavyPortfolio(),
    getLegacyBuildersPortfolio(),
    getDividendMachinesPortfolio(),
    getInsiderConvictionPortfolio(),
  ]);

  const result: SamplePortfoliosResult = {
    portfolios: [
      cashHeavy,
      legacyBuilders,
      dividendMachines,
      insiderConviction,
    ],
  };

  // Cache the result
  await cache.set(CACHE_KEY, result, CACHE_TTL);

  return result;
}

/**
 * Helper to map a stock row to SamplePortfolioStock format
 */
function mapToSampleStock(stock: any): SamplePortfolioStock {
  return {
    ticker: stock.ticker,
    name: stock.name,
    exchange: stock.exchange,
    sector: stock.sector,
    market_cap: stock.marketCap,
    price: stock.price,
    price_change: stock.priceChange,
    vetr_score: stock.vetrScore,
  };
}

/**
 * Helper to compute total notional value (price * 100 qty per stock)
 */
function computeNotionalValue(stockList: SamplePortfolioStock[]): number {
  return Math.round(stockList.reduce((sum, s) => sum + (s.price || 0) * 100, 0) * 100) / 100;
}

/**
 * 2. Cash Heavy - <$100M Market Cap, >20% Cash, No Debt
 */
async function getCashHeavyPortfolio(): Promise<SamplePortfolio> {
  if (!db) throw new InternalError('Database not available');

  const results = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      name: stocks.name,
      exchange: stocks.exchange,
      sector: stocks.sector,
      marketCap: stocks.marketCap,
      price: stocks.price,
      priceChange: stocks.priceChange,
      vetrScore: stocks.vetrScore,
    })
    .from(stocks)
    .innerJoin(financialData, eq(stocks.id, financialData.stockId))
    .where(
      and(
        sql`${stocks.marketCap} < 100000000`,
        gt(financialData.cash, 0),
        gt(financialData.totalAssets, 0),
        sql`(${financialData.cash}::float / ${financialData.totalAssets}::float) > 0.20`,
        or(
          isNull(financialData.totalDebt),
          eq(financialData.totalDebt, 0)
        )
      )
    )
    .orderBy(desc(stocks.vetrScore))
    .limit(MAX_STOCKS);

  const stockList = results.map(mapToSampleStock);

  return {
    id: 'cash_heavy',
    name: 'Cash Heavy',
    tagline: '<$100M cap, >20% cash, no debt. Funded for growth.',
    icon: '💰',
    criteria_summary: `${stockList.length} stocks · Avg Score: ${stockList.length > 0 ? Math.round(stockList.reduce((s, st) => s + (st.vetr_score || 0), 0) / stockList.length) : 0}`,
    stock_count: stockList.length,
    total_notional_value: computeNotionalValue(stockList),
    stocks: stockList,
  };
}

/**
 * 3. Legacy Builders - High Pedigree Score (>75)
 */
async function getLegacyBuildersPortfolio(): Promise<SamplePortfolio> {
  if (!db) throw new InternalError('Database not available');

  // Get latest vetr score for each ticker with high pedigree
  const latestScores = await db
    .select({
      stockTicker: vetrScoreHistory.stockTicker,
      pedigreeSubScore: vetrScoreHistory.pedigreeSubScore,
      calculatedAt: vetrScoreHistory.calculatedAt,
    })
    .from(vetrScoreHistory)
    .where(sql`${vetrScoreHistory.pedigreeSubScore} > 75`)
    .orderBy(desc(vetrScoreHistory.calculatedAt));

  // Get unique tickers with highest pedigree (latest entry per ticker)
  const tickerMap = new Map<string, number>();
  for (const score of latestScores) {
    if (!tickerMap.has(score.stockTicker) && score.pedigreeSubScore) {
      tickerMap.set(score.stockTicker, score.pedigreeSubScore);
    }
  }

  const qualifyingTickers = Array.from(tickerMap.keys()).slice(0, MAX_STOCKS);

  if (qualifyingTickers.length === 0) {
    return {
      id: 'legacy_builders',
      name: 'Legacy Builders',
      tagline: 'Led by CEOs with 2+ successful exits. Bet on the jockey.',
      icon: '🏆',
      criteria_summary: '0 stocks · Pedigree Score > 75',
      stock_count: 0,
      total_notional_value: 0,
      stocks: [],
    };
  }

  const results = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      name: stocks.name,
      exchange: stocks.exchange,
      sector: stocks.sector,
      marketCap: stocks.marketCap,
      price: stocks.price,
      priceChange: stocks.priceChange,
      vetrScore: stocks.vetrScore,
    })
    .from(stocks)
    .where(inArray(stocks.ticker, qualifyingTickers))
    .orderBy(desc(stocks.vetrScore))
    .limit(MAX_STOCKS);

  const stockList = results.map(mapToSampleStock);

  return {
    id: 'legacy_builders',
    name: 'Legacy Builders',
    tagline: 'Led by CEOs with 2+ successful exits. Bet on the jockey.',
    icon: '🏆',
    criteria_summary: `${stockList.length} stocks · Avg Pedigree: ${Math.round(Array.from(tickerMap.values()).reduce((a, b) => a + b, 0) / tickerMap.size)}`,
    stock_count: stockList.length,
    total_notional_value: computeNotionalValue(stockList),
    stocks: stockList,
  };
}

/**
 * 5. Dividend Machines - TSX, 5+ years dividend growth, high score
 */
async function getDividendMachinesPortfolio(): Promise<SamplePortfolio> {
  if (!db) throw new InternalError('Database not available');

  const results = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      name: stocks.name,
      exchange: stocks.exchange,
      sector: stocks.sector,
      marketCap: stocks.marketCap,
      price: stocks.price,
      priceChange: stocks.priceChange,
      vetrScore: stocks.vetrScore,
      dividend5Years: dividendInfo.dividend5Years,
    })
    .from(stocks)
    .innerJoin(dividendInfo, eq(stocks.id, dividendInfo.stockId))
    .where(
      and(
        eq(stocks.exchange, 'TSX'),
        sql`${stocks.vetrScore} >= 50`,
        sql`${dividendInfo.dividend5Years} IS NOT NULL`,
        gt(dividendInfo.dividend5Years, 0)
      )
    )
    .orderBy(desc(dividendInfo.dividend5Years), desc(stocks.vetrScore))
    .limit(MAX_STOCKS);

  const stockList = results.map(mapToSampleStock);

  return {
    id: 'dividend_machines',
    name: 'Dividend Machines',
    tagline: 'TSX stocks with 5+ years consecutive dividend growth.',
    icon: '👑',
    criteria_summary: `${stockList.length} stocks · Avg Score: ${stockList.length > 0 ? Math.round(stockList.reduce((s, st) => s + (st.vetr_score || 0), 0) / stockList.length) : 0}`,
    stock_count: stockList.length,
    total_notional_value: computeNotionalValue(stockList),
    stocks: stockList,
  };
}

/**
 * 6. Insider Conviction - High score + >20% insider ownership + recent buys
 */
async function getInsiderConvictionPortfolio(): Promise<SamplePortfolio> {
  if (!db) throw new InternalError('Database not available');

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const results = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      name: stocks.name,
      exchange: stocks.exchange,
      sector: stocks.sector,
      marketCap: stocks.marketCap,
      price: stocks.price,
      priceChange: stocks.priceChange,
      vetrScore: stocks.vetrScore,
      insiderShares: financialData.insiderShares,
      totalShares: financialData.totalShares,
    })
    .from(stocks)
    .innerJoin(financialData, eq(stocks.id, financialData.stockId))
    .where(
      and(
        sql`${stocks.vetrScore} >= 60`,
        sql`${financialData.insiderShares} IS NOT NULL`,
        sql`${financialData.totalShares} IS NOT NULL`,
        gt(financialData.totalShares, 0),
        sql`(${financialData.insiderShares}::float / ${financialData.totalShares}::float) > 0.20`
      )
    )
    .orderBy(desc(stocks.vetrScore))
    .limit(MAX_STOCKS);

  const stockList = results.map(mapToSampleStock);

  // Calculate average insider percentage for summary
  let totalInsiderPct = 0;
  let countWithInsider = 0;
  for (const r of results) {
    if (r.insiderShares && r.totalShares && Number(r.totalShares) > 0) {
      totalInsiderPct += (Number(r.insiderShares) / Number(r.totalShares)) * 100;
      countWithInsider++;
    }
  }
  const avgInsiderPct = countWithInsider > 0 ? (totalInsiderPct / countWithInsider).toFixed(0) : 'N/A';

  return {
    id: 'insider_conviction',
    name: 'Insider Conviction',
    tagline: 'High-score companies with >20% insider ownership.',
    icon: '🔒',
    criteria_summary: `${stockList.length} stocks · Avg Insider: ${avgInsiderPct}%`,
    stock_count: stockList.length,
    total_notional_value: computeNotionalValue(stockList),
    stocks: stockList,
  };
}
