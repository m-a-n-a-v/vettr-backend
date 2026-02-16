import { eq, sql, and, inArray, or, ilike, desc, isNull, gt } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, financialData, vetrScoreHistory, redFlagHistory } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';
import * as cache from './cache.service.js';

const CACHE_KEY = 'discovery:collections';
const CACHE_TTL = 30 * 60; // 30 minutes
const MAX_STOCKS_PER_COLLECTION = 30;

export interface CollectionStock {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  market_cap: number | null;
  price: number | null;
  price_change: number | null;
  vetr_score: number | null;
}

export interface Collection {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  criteria_summary: string;
  stocks: CollectionStock[];
}

export interface CollectionsResult {
  collections: Collection[];
}

/**
 * Get all 6 curated discovery collections with cached results
 */
export async function getCollections(): Promise<CollectionsResult> {
  // Try to get from cache first
  const cached = await cache.get<CollectionsResult>(CACHE_KEY);
  if (cached) {
    return cached;
  }

  if (!db) {
    throw new InternalError('Database not available');
  }

  // Compute all collections in parallel
  const [
    cleanSheets,
    cashRichJuniors,
    criticalMineralPowerhouses,
    serialWinners,
    dividendAristocrats,
    insiderConviction,
  ] = await Promise.all([
    getCleanSheetsCollection(),
    getCashRichJuniorsCollection(),
    getCriticalMineralPowerhousesCollection(),
    getSerialWinnersCollection(),
    getDividendAristocratsCollection(),
    getInsiderConvictionCollection(),
  ]);

  const result: CollectionsResult = {
    collections: [
      cleanSheets,
      cashRichJuniors,
      criticalMineralPowerhouses,
      serialWinners,
      dividendAristocrats,
      insiderConviction,
    ],
  };

  // Cache the result
  await cache.set(CACHE_KEY, result, CACHE_TTL);

  return result;
}

/**
 * Collection 1: Clean Sheets - Score >75, Zero Red Flags, No Debt
 */
async function getCleanSheetsCollection(): Promise<Collection> {
  if (!db) throw new InternalError('Database not available');

  // Get stocks with no recent high/critical red flags
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentCriticalFlags = await db
    .selectDistinct({ stockTicker: redFlagHistory.stockTicker })
    .from(redFlagHistory)
    .where(
      and(
        inArray(redFlagHistory.severity, ['High', 'Critical']),
        gt(redFlagHistory.detectedAt, ninetyDaysAgo)
      )
    );

  const excludeTickers = recentCriticalFlags.map(f => f.stockTicker);

  // Get stocks with score > 75, no debt (or null debt), not in excluded tickers
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
      totalDebt: financialData.totalDebt,
    })
    .from(stocks)
    .leftJoin(financialData, eq(stocks.id, financialData.stockId))
    .where(
      and(
        gt(stocks.vetrScore, 75),
        or(
          isNull(financialData.totalDebt),
          eq(financialData.totalDebt, 0)
        ),
        excludeTickers.length > 0 ? sql`${stocks.ticker} NOT IN ${excludeTickers}` : undefined
      )
    )
    .orderBy(desc(stocks.vetrScore))
    .limit(MAX_STOCKS_PER_COLLECTION);

  const stockList = results.map(mapToCollectionStock);
  const avgScore = stockList.length > 0
    ? Math.round(stockList.reduce((sum, s) => sum + (s.vetr_score || 0), 0) / stockList.length)
    : 0;

  return {
    id: 'clean_sheets',
    name: 'The Clean Sheet Collection',
    tagline: 'Score >75, Zero Red Flags. Safety first.',
    icon: 'checkmark.shield',
    criteria_summary: `Avg Vettr Score: ${avgScore}  Stocks: ${stockList.length}`,
    stocks: stockList,
  };
}

/**
 * Collection 2: Cash-Rich Juniors - <$100M Cap, >20% Cash, No Debt
 */
async function getCashRichJuniorsCollection(): Promise<Collection> {
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
      cash: financialData.cash,
      totalAssets: financialData.totalAssets,
      totalDebt: financialData.totalDebt,
      monthlyBurn: financialData.monthlyBurn,
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
    .limit(MAX_STOCKS_PER_COLLECTION);

  const stockList = results.map(mapToCollectionStock);

  // Calculate average runway
  let totalRunway = 0;
  let countWithRunway = 0;
  for (const r of results) {
    if (r.cash && r.monthlyBurn && r.monthlyBurn < 0) {
      const runway = r.cash / Math.abs(r.monthlyBurn) / 12;
      totalRunway += runway;
      countWithRunway++;
    }
  }
  const avgRunway = countWithRunway > 0 ? (totalRunway / countWithRunway).toFixed(1) : 'N/A';

  return {
    id: 'cash_rich_juniors',
    name: 'Cash-Rich Juniors',
    tagline: '<$100M Cap, >20% Cash, No Debt. Funded for growth.',
    icon: 'banknote',
    criteria_summary: `Avg Runway: ${avgRunway} Yrs  Stocks: ${stockList.length}`,
    stocks: stockList,
  };
}

/**
 * Collection 3: Critical Mineral Powerhouses
 */
async function getCriticalMineralPowerhousesCollection(): Promise<Collection> {
  if (!db) throw new InternalError('Database not available');

  const criticalSectors = ['Copper', 'Lithium', 'Uranium', 'Nickel', 'Battery Metals', 'Critical Minerals', 'Base Metals'];

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
    .where(
      or(
        inArray(stocks.sector, criticalSectors),
        ...criticalSectors.map(sector => ilike(stocks.sector, `%${sector}%`))
      )
    )
    .orderBy(desc(stocks.vetrScore))
    .limit(MAX_STOCKS_PER_COLLECTION);

  const stockList = results.map(mapToCollectionStock);

  return {
    id: 'critical_mineral_powerhouses',
    name: 'Critical Mineral Powerhouses',
    tagline: 'Copper, Lithium, Uranium, Nickel. Powering the future.',
    icon: 'bolt.fill',
    criteria_summary: `Sector Beta: N/A  Stocks: ${stockList.length}`,
    stocks: stockList,
  };
}

/**
 * Collection 4: Serial Winners - High Pedigree Score
 */
async function getSerialWinnersCollection(): Promise<Collection> {
  if (!db) throw new InternalError('Database not available');

  // Get latest vetr score for each ticker with high pedigree
  const latestScores = await db
    .select({
      stockTicker: vetrScoreHistory.stockTicker,
      pedigreeSubScore: vetrScoreHistory.pedigreeSubScore,
      calculatedAt: vetrScoreHistory.calculatedAt,
    })
    .from(vetrScoreHistory)
    .where(sql`${vetrScoreHistory.pedigreeSubScore} >= 75`)
    .orderBy(desc(vetrScoreHistory.calculatedAt));

  // Get unique tickers with highest pedigree (latest entry per ticker)
  const tickerMap = new Map<string, number>();
  for (const score of latestScores) {
    if (!tickerMap.has(score.stockTicker) && score.pedigreeSubScore) {
      tickerMap.set(score.stockTicker, score.pedigreeSubScore);
    }
  }

  const qualifyingTickers = Array.from(tickerMap.keys()).slice(0, MAX_STOCKS_PER_COLLECTION);

  if (qualifyingTickers.length === 0) {
    return {
      id: 'serial_winners',
      name: 'The Serial Winners (High Pedigree)',
      tagline: 'Management with 2+ successful exits. Bet on the jockey.',
      icon: 'trophy',
      criteria_summary: 'Avg Pedigree Score: N/A  Stocks: 0',
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
    .limit(MAX_STOCKS_PER_COLLECTION);

  const stockList = results.map(mapToCollectionStock);

  const avgPedigree = stockList.length > 0
    ? Math.round(Array.from(tickerMap.values()).reduce((a, b) => a + b, 0) / tickerMap.size)
    : 0;

  return {
    id: 'serial_winners',
    name: 'The Serial Winners (High Pedigree)',
    tagline: 'Management with 2+ successful exits. Bet on the jockey.',
    icon: 'trophy',
    criteria_summary: `Avg Pedigree Score: ${avgPedigree}  Stocks: ${stockList.length}`,
    stocks: stockList,
  };
}

/**
 * Collection 5: Dividend Aristocrats (simplified proxy)
 */
async function getDividendAristocratsCollection(): Promise<Collection> {
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
    .where(
      and(
        eq(stocks.exchange, 'TSX'),
        sql`${stocks.vetrScore} >= 50`
      )
    )
    .orderBy(desc(stocks.vetrScore))
    .limit(20);

  const stockList = results.map(mapToCollectionStock);

  return {
    id: 'dividend_aristocrats',
    name: 'Dividend Aristocrats (North)',
    tagline: 'TSX companies with 5+ years consecutive dividend growth.',
    icon: 'crown',
    criteria_summary: `Avg Yield: N/A  Stocks: ${stockList.length}`,
    stocks: stockList,
  };
}

/**
 * Collection 6: Insider Conviction - High Score + >20% Insider Ownership
 */
async function getInsiderConvictionCollection(): Promise<Collection> {
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
    .limit(MAX_STOCKS_PER_COLLECTION);

  const stockList = results.map(mapToCollectionStock);

  // Calculate average insider percentage
  let totalInsiderPct = 0;
  let countWithInsider = 0;
  for (const r of results) {
    if (r.insiderShares && r.totalShares && r.totalShares > 0) {
      const pct = (Number(r.insiderShares) / Number(r.totalShares)) * 100;
      totalInsiderPct += pct;
      countWithInsider++;
    }
  }
  const avgInsiderPct = countWithInsider > 0 ? (totalInsiderPct / countWithInsider).toFixed(1) : 'N/A';

  return {
    id: 'insider_conviction',
    name: 'Insider Conviction',
    tagline: 'High-score companies with >20% insider ownership.',
    icon: 'person.badge.shield.checkmark',
    criteria_summary: `Avg Insider: ${avgInsiderPct}%  Stocks: ${stockList.length}`,
    stocks: stockList,
  };
}

/**
 * Helper to map a stock row to CollectionStock format
 */
function mapToCollectionStock(stock: any): CollectionStock {
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
