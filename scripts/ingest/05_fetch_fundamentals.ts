/**
 * Phase 5: Fetch fundamentals data for all tickers from Yahoo Finance + TMX GraphQL.
 *
 * Populates 13 new tables: valuation_metrics, earnings_history, earnings_estimates,
 * analyst_consensus, analyst_actions, short_interest, institutional_holders,
 * major_holders_breakdown, insider_holdings, insider_transactions, dividend_info,
 * corporate_events, stock_news.
 *
 * Features:
 * - Conservative throttling (3 concurrent Yahoo, sequential TMX with delays)
 * - Resume support via progress file
 * - Exponential backoff on rate limit errors
 * - Per-ticker error isolation
 *
 * Usage:
 *   node --env-file=.env.production node_modules/.bin/tsx scripts/ingest/05_fetch_fundamentals.ts
 */

import YahooFinance from 'yahoo-finance2';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { db } from '../../src/config/database.js';
import {
  stocks,
  valuationMetrics,
  earningsHistory,
  earningsEstimates,
  analystConsensus,
  analystActions,
  shortInterest,
  institutionalHolders,
  majorHoldersBreakdown,
  insiderHoldings,
  insiderTransactions,
  dividendInfo,
  corporateEvents,
  stockNews,
} from '../../src/db/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ───────────────────────────────────────────────────────────

const YAHOO_CONCURRENCY = 3;       // Conservative: 3 parallel Yahoo calls
const YAHOO_DELAY_MS = 1500;       // 1.5s between batches (~120 req/hour)
const TMX_DELAY_MS = 300;          // 300ms between TMX queries (sequential)
const RETRY_DELAYS = [5000, 15000, 45000]; // Exponential backoff for 429s
const PROGRESS_FILE = join(__dirname, 'data', 'fundamentals_progress.json');
const LOG_FILE = join(__dirname, 'data', 'fundamentals_log.txt');

const EXCHANGE_SUFFIX: Record<string, string> = {
  TSX: '.TO',
  TSXV: '.V',
  CSE: '.CN',
  NYSE: '',
};

const YAHOO_MODULES = [
  'assetProfile',
  'defaultKeyStatistics',
  'summaryDetail',
  'financialData',
  'earningsHistory',
  'earningsTrend',
  'recommendationTrend',
  'upgradeDowngradeHistory',
  'institutionOwnership',
  'fundOwnership',
  'majorHoldersBreakdown',
  'insiderHolders',
  'insiderTransactions',
  'netSharePurchaseActivity',
  'calendarEvents',
  'price',
] as const;

// Yahoo Finance client
const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] }) as InstanceType<any>;

// TMX GraphQL
const TMX_GRAPHQL_URL = 'https://app-money.tmx.com/graphql';
const TMX_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Origin': 'https://money.tmx.com',
  'Referer': 'https://money.tmx.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface TmxQuote {
  pe?: number;
  priceToBook?: number;
  priceToCashFlow?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  totalDebtToEquity?: number;
  dividendYield?: number;
  dividendAmount?: number;
  exDividendDate?: string;
  dividendPayDate?: string;
  dividendFrequency?: string;
  dividendCurrency?: string;
}

interface TmxAnalysts {
  totalAnalysts?: number;
  consensusAnalysts?: { buy?: number; hold?: number; sell?: number; consensus?: string };
  priceTarget?: { priceTarget?: number; highPriceTarget?: number; lowPriceTarget?: number };
}

interface TmxShortInterest {
  SHORT_INTEREST?: number;
  SHORTINTERESTPCT?: number;
  DAYSTOCOVER10DAY?: number;
  DAYSTOCOVER30DAY?: number;
  DAYSTOCOVER90DAY?: number;
  BUSINESS_DATE?: string;
}

interface TmxEarningsSurprise {
  date?: string;
  actualEps?: number;
  percentSurprise?: number;
}

interface TmxEvent {
  event_id?: string;
  event_type?: string;
  event_date?: string;
  event_name?: string;
  event_status?: string;
  event_url?: string;
}

interface TmxNewsItem {
  headline?: string;
  summary?: string;
  source?: string;
  datetime?: string;
  newsUrl?: string;
}

interface TmxData {
  quote: TmxQuote | null;
  analysts: TmxAnalysts | null;
  shortInterest: TmxShortInterest | null;
  earnings: { surprises: TmxEarningsSurprise[] } | null;
  events: TmxEvent[];
  news: TmxNewsItem[];
}

interface ProgressData {
  startedAt: string;
  lastUpdatedAt: string;
  totalTickers: number;
  completed: string[];
  failed: Record<string, string>;
  stats: {
    completed: number;
    failed: number;
    remaining: number;
    yahooHits: number;
    tmxHits: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? null : n;
}

function safeInt(val: unknown): number | null {
  const n = safeNum(val);
  return n === null ? null : Math.round(n);
}

function safeDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val as string | number);
  return isNaN(d.getTime()) ? null : d;
}

function safeStr(val: unknown, maxLen?: number): string | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val);
  return maxLen ? s.slice(0, maxLen) : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let startTime = Date.now();

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
}

// ─── Progress Tracker ────────────────────────────────────────────────────────

function loadProgress(): ProgressData {
  if (existsSync(PROGRESS_FILE)) {
    try {
      const raw = readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(raw) as ProgressData;
    } catch {
      log('Warning: Could not parse progress file, starting fresh');
    }
  }
  return {
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    totalTickers: 0,
    completed: [],
    failed: {},
    stats: { completed: 0, failed: 0, remaining: 0, yahooHits: 0, tmxHits: 0 },
  };
}

function saveProgress(progress: ProgressData): void {
  progress.lastUpdatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── TMX GraphQL Client ─────────────────────────────────────────────────────

const TMX_QUOTE_QUERY = `
query getQuoteBySymbol($symbol: String!, $locale: String!) {
  getQuoteBySymbol(symbol: $symbol, locale: $locale) {
    symbol name price peRatio priceToBook priceToCashFlow
    returnOnEquity returnOnAssets totalDebtToEquity
    dividendYield dividendAmount exDividendDate dividendPayDate
    dividendFrequency dividendCurrency
  }
}`;

const TMX_ANALYSTS_QUERY = `
query getAnalystsBySymbol($symbol: String!, $locale: String!) {
  getAnalystsBySymbol(symbol: $symbol, locale: $locale) {
    totalAnalysts
    consensusAnalysts { buy hold sell consensus }
    priceTarget { priceTarget highPriceTarget lowPriceTarget }
  }
}`;

const TMX_SHORT_INTEREST_QUERY = `
query getShortInterestBySymbol($symbol: String!, $locale: String!) {
  getShortInterestBySymbol(symbol: $symbol, locale: $locale) {
    QM_TICKER BUSINESS_DATE SHORT_INTEREST SHORTINTERESTPCT
    DAYSTOCOVER10DAY DAYSTOCOVER30DAY DAYSTOCOVER90DAY
  }
}`;

const TMX_EARNINGS_QUERY = `
query getEarningsBySymbol($symbol: String!, $locale: String!) {
  getEarningsBySymbol(symbol: $symbol, locale: $locale) {
    surprises { date actualEps percentSurprise }
  }
}`;

const TMX_EVENTS_QUERY = `
query getEventsBySymbol($symbol: String!, $locale: String!) {
  getEventsBySymbol(symbol: $symbol, locale: $locale) {
    data { event_id event_type event_date event_name event_status event_url }
  }
}`;

const TMX_NEWS_QUERY = `
query getNewsBySymbol($symbol: String!, $locale: String!, $page: Int, $limit: Int) {
  getNewsBySymbol(symbol: $symbol, locale: $locale, page: $page, limit: $limit) {
    headline summary source datetime newsUrl
  }
}`;

async function tmxQuery(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(TMX_GRAPHQL_URL, {
    method: 'POST',
    headers: TMX_HEADERS,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`TMX HTTP ${res.status}`);
  const json = await res.json() as any;
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function fetchTmxData(ticker: string): Promise<TmxData> {
  const result: TmxData = {
    quote: null, analysts: null, shortInterest: null,
    earnings: null, events: [], news: [],
  };

  const vars = { symbol: ticker, locale: 'en' };

  try {
    // Sequential TMX queries with delays
    try {
      const qd = await tmxQuery(TMX_QUOTE_QUERY, vars);
      result.quote = qd?.getQuoteBySymbol ?? null;
    } catch { /* skip */ }
    await sleep(TMX_DELAY_MS);

    try {
      const ad = await tmxQuery(TMX_ANALYSTS_QUERY, vars);
      result.analysts = ad?.getAnalystsBySymbol ?? null;
    } catch { /* skip */ }
    await sleep(TMX_DELAY_MS);

    try {
      const sid = await tmxQuery(TMX_SHORT_INTEREST_QUERY, vars);
      result.shortInterest = sid?.getShortInterestBySymbol ?? null;
    } catch { /* skip */ }
    await sleep(TMX_DELAY_MS);

    try {
      const ed = await tmxQuery(TMX_EARNINGS_QUERY, vars);
      result.earnings = ed?.getEarningsBySymbol ?? null;
    } catch { /* skip */ }
    await sleep(TMX_DELAY_MS);

    try {
      const evd = await tmxQuery(TMX_EVENTS_QUERY, vars);
      result.events = evd?.getEventsBySymbol?.data ?? [];
    } catch { /* skip */ }
    await sleep(TMX_DELAY_MS);

    try {
      const nd = await tmxQuery(TMX_NEWS_QUERY, { ...vars, page: 1, limit: 10 });
      const newsData = nd?.getNewsBySymbol;
      result.news = Array.isArray(newsData) ? newsData : [];
    } catch { /* skip */ }
  } catch {
    // Top-level TMX failure — return whatever we got
  }

  return result;
}

// ─── Yahoo Finance Fetch with Retry ──────────────────────────────────────────

async function fetchYahooData(yfTicker: string): Promise<any> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await yf.quoteSummary(yfTicker, { modules: [...YAHOO_MODULES] });
      return result;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      // Rate limited
      if (msg.includes('429') || msg.includes('Too Many') || msg.includes('rate')) {
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          log(`  [YAHOO] ${yfTicker} rate-limited, retry in ${delay / 1000}s (attempt ${attempt + 1})`);
          await sleep(delay);
          continue;
        }
      }
      // Not found or other error — don't retry
      return null;
    }
  }
  return null;
}

// ─── Data Mappers (13 functions) ─────────────────────────────────────────────

function mapValuationMetrics(stockId: string, y: any, tmx: TmxData): typeof valuationMetrics.$inferInsert {
  const ks = y?.defaultKeyStatistics;
  const sd = y?.summaryDetail;
  const fd = y?.financialData;
  const ap = y?.assetProfile;
  const tq = tmx.quote;

  return {
    stockId,
    peRatio: safeNum(sd?.trailingPE) ?? safeNum(tq?.peRatio),
    forwardPE: safeNum(ks?.forwardPE) ?? safeNum(sd?.forwardPE),
    priceToBook: safeNum(ks?.priceToBook) ?? safeNum(tq?.priceToBook),
    priceToCashFlow: safeNum(tq?.priceToCashFlow),
    priceToSales: safeNum(sd?.priceToSalesTrailing12Months),
    enterpriseToRevenue: safeNum(ks?.enterpriseToRevenue),
    enterpriseToEbitda: safeNum(ks?.enterpriseToEbitda),
    enterpriseValue: safeNum(ks?.enterpriseValue),
    bookValue: safeNum(ks?.bookValue),
    profitMargins: safeNum(ks?.profitMargins) ?? safeNum(fd?.profitMargins),
    returnOnEquity: safeNum(fd?.returnOnEquity) ?? safeNum(tq?.returnOnEquity),
    returnOnAssets: safeNum(fd?.returnOnAssets) ?? safeNum(tq?.returnOnAssets),
    earningsQuarterlyGrowth: safeNum(ks?.earningsQuarterlyGrowth),
    beta: safeNum(sd?.beta) ?? safeNum(ks?.beta),
    totalDebtToEquity: safeNum(fd?.debtToEquity) ?? safeNum(tq?.totalDebtToEquity),
    weeks52High: safeNum(sd?.fiftyTwoWeekHigh),
    weeks52Low: safeNum(sd?.fiftyTwoWeekLow),
    fiftyDayAverage: safeNum(sd?.fiftyDayAverage),
    twoHundredDayAverage: safeNum(sd?.twoHundredDayAverage),
    week52Change: safeNum(ks?.['52WeekChange']),
    trailingEps: safeNum(ks?.trailingEps),
    forwardEps: safeNum(ks?.forwardEps),
    auditRisk: safeInt(ap?.auditRisk),
    boardRisk: safeInt(ap?.boardRisk),
    compensationRisk: safeInt(ap?.compensationRisk),
    shareholderRightsRisk: safeInt(ap?.shareHolderRightsRisk),
    overallRisk: safeInt(ap?.overallRisk),
    updatedAt: new Date(),
  };
}

function mapEarningsHistory(stockId: string, y: any, tmx: TmxData): Array<typeof earningsHistory.$inferInsert> {
  const results: Array<typeof earningsHistory.$inferInsert> = [];
  const seen = new Set<string>();

  // Yahoo earningsHistory (richer — has estimate + difference)
  for (const h of (y?.earningsHistory?.history ?? [])) {
    const quarter = safeDate(h.quarter);
    if (!quarter) continue;
    const key = quarter.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      stockId, quarter,
      period: safeStr(h.period, 10),
      currency: safeStr(h.currency, 10),
      epsActual: safeNum(h.epsActual),
      epsEstimate: safeNum(h.epsEstimate),
      epsDifference: safeNum(h.epsDifference),
      surprisePercent: safeNum(h.surprisePercent),
    });
  }

  // TMX earnings surprises (fill gaps — longer history)
  for (const s of (tmx.earnings?.surprises ?? [])) {
    const quarter = safeDate(s.date);
    if (!quarter) continue;
    const key = quarter.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      stockId, quarter,
      period: null, currency: null,
      epsActual: safeNum(s.actualEps),
      epsEstimate: null, epsDifference: null,
      surprisePercent: safeNum(s.percentSurprise),
    });
  }

  return results;
}

function mapEarningsEstimates(stockId: string, y: any): Array<typeof earningsEstimates.$inferInsert> {
  const trends = y?.earningsTrend?.trend ?? [];
  return trends.map((t: any) => ({
    stockId,
    period: String(t.period ?? ''),
    endDate: safeDate(t.endDate),
    currency: safeStr(t.earningsEstimate?.earningsCurrency, 10),
    epsAvg: safeNum(t.earningsEstimate?.avg),
    epsLow: safeNum(t.earningsEstimate?.low),
    epsHigh: safeNum(t.earningsEstimate?.high),
    epsYearAgo: safeNum(t.earningsEstimate?.yearAgoEps),
    epsGrowth: safeNum(t.earningsEstimate?.growth),
    numberOfAnalystsEps: safeInt(t.earningsEstimate?.numberOfAnalysts),
    revenueAvg: safeNum(t.revenueEstimate?.avg),
    revenueLow: safeNum(t.revenueEstimate?.low),
    revenueHigh: safeNum(t.revenueEstimate?.high),
    revenueYearAgo: safeNum(t.revenueEstimate?.yearAgoRevenue),
    revenueGrowth: safeNum(t.revenueEstimate?.growth),
    numberOfAnalystsRevenue: safeInt(t.revenueEstimate?.numberOfAnalysts),
    epsTrendCurrent: safeNum(t.epsTrend?.current),
    epsTrend7dAgo: safeNum(t.epsTrend?.['7daysAgo']),
    epsTrend30dAgo: safeNum(t.epsTrend?.['30daysAgo']),
    epsTrend60dAgo: safeNum(t.epsTrend?.['60daysAgo']),
    epsTrend90dAgo: safeNum(t.epsTrend?.['90daysAgo']),
    revisionsUpLast7d: safeInt(t.epsRevisions?.upLast7days),
    revisionsUpLast30d: safeInt(t.epsRevisions?.upLast30days),
    revisionsDownLast7d: safeInt(t.epsRevisions?.downLast7Days),
    revisionsDownLast30d: safeInt(t.epsRevisions?.downLast30days),
    updatedAt: new Date(),
  }));
}

function mapAnalystConsensus(stockId: string, y: any, tmx: TmxData): typeof analystConsensus.$inferInsert {
  const ta = tmx.analysts;
  const yRec = y?.recommendationTrend?.trend ?? [];

  return {
    stockId,
    totalAnalysts: safeInt(ta?.totalAnalysts),
    buyCount: safeInt(ta?.consensusAnalysts?.buy),
    holdCount: safeInt(ta?.consensusAnalysts?.hold),
    sellCount: safeInt(ta?.consensusAnalysts?.sell),
    consensus: safeStr(ta?.consensusAnalysts?.consensus, 20),
    priceTarget: safeNum(ta?.priceTarget?.priceTarget),
    priceTargetHigh: safeNum(ta?.priceTarget?.highPriceTarget),
    priceTargetLow: safeNum(ta?.priceTarget?.lowPriceTarget),
    recommendationTrend: yRec.length > 0 ? yRec.map((t: any) => ({
      period: t.period, strongBuy: t.strongBuy, buy: t.buy,
      hold: t.hold, sell: t.sell, strongSell: t.strongSell,
    })) : null,
    updatedAt: new Date(),
  };
}

function mapAnalystActions(stockId: string, y: any): Array<typeof analystActions.$inferInsert> {
  const history = y?.upgradeDowngradeHistory?.history ?? [];
  return history.slice(0, 50).map((h: any) => ({
    stockId,
    actionDate: safeDate(h.epochGradeDate) ?? new Date(),
    firm: safeStr(h.firm, 255) ?? 'Unknown',
    action: safeStr(h.action, 20) ?? 'unknown',
    toGrade: safeStr(h.toGrade, 50),
    fromGrade: safeStr(h.fromGrade, 50),
    priceTargetAction: safeStr(h.priceTargetAction, 30),
    currentPriceTarget: safeNum(h.currentPriceTarget),
    priorPriceTarget: safeNum(h.priorPriceTarget),
  }));
}

function mapShortInterest(stockId: string, tmx: TmxData): typeof shortInterest.$inferInsert | null {
  const si = tmx.shortInterest;
  if (!si) return null;
  return {
    stockId,
    shortShares: safeInt(si.SHORT_INTEREST),
    shortInterestPct: safeNum(si.SHORTINTERESTPCT),
    daysToCover10d: safeNum(si.DAYSTOCOVER10DAY),
    daysToCover30d: safeNum(si.DAYSTOCOVER30DAY),
    daysToCover90d: safeNum(si.DAYSTOCOVER90DAY),
    reportDate: safeDate(si.BUSINESS_DATE),
    updatedAt: new Date(),
  };
}

function mapInstitutionalHolders(stockId: string, y: any): Array<typeof institutionalHolders.$inferInsert> {
  const results: Array<typeof institutionalHolders.$inferInsert> = [];

  for (const h of (y?.institutionOwnership?.ownershipList ?? [])) {
    results.push({
      stockId, holderType: 'institution',
      organization: safeStr(h.organization, 500) ?? 'Unknown',
      reportDate: safeDate(h.reportDate),
      pctHeld: safeNum(h.pctHeld), position: safeInt(h.position),
      value: safeNum(h.value), pctChange: safeNum(h.pctChange),
    });
  }

  for (const h of (y?.fundOwnership?.ownershipList ?? [])) {
    results.push({
      stockId, holderType: 'fund',
      organization: safeStr(h.organization, 500) ?? 'Unknown',
      reportDate: safeDate(h.reportDate),
      pctHeld: safeNum(h.pctHeld), position: safeInt(h.position),
      value: safeNum(h.value), pctChange: safeNum(h.pctChange),
    });
  }

  return results;
}

function mapMajorHoldersBreakdown(stockId: string, y: any): typeof majorHoldersBreakdown.$inferInsert {
  const mhb = y?.majorHoldersBreakdown;
  const nspa = y?.netSharePurchaseActivity;
  return {
    stockId,
    insidersPercentHeld: safeNum(mhb?.insidersPercentHeld),
    institutionsPercentHeld: safeNum(mhb?.institutionsPercentHeld),
    institutionsFloatPercentHeld: safeNum(mhb?.institutionsFloatPercentHeld),
    institutionsCount: safeInt(mhb?.institutionsCount),
    netBuyCount: safeInt(nspa?.buyInfoCount),
    netSellCount: safeInt(nspa?.sellInfoCount),
    netShares: safeInt(nspa?.netInfoShares),
    totalInsiderShares: safeInt(nspa?.totalInsiderShares),
    updatedAt: new Date(),
  };
}

function mapInsiderHoldings(stockId: string, y: any): Array<typeof insiderHoldings.$inferInsert> {
  return (y?.insiderHolders?.holders ?? []).map((h: any) => ({
    stockId,
    name: safeStr(h.name, 255) ?? 'Unknown',
    relation: safeStr(h.relation, 100),
    latestTransDate: safeDate(h.latestTransDate),
    transactionDescription: safeStr(h.transactionDescription, 255),
    positionDirect: safeInt(h.positionDirect),
    positionDirectDate: safeDate(h.positionDirectDate),
    positionIndirect: safeInt(h.positionIndirect),
    positionIndirectDate: safeDate(h.positionIndirectDate),
  }));
}

function mapInsiderTransactions(stockId: string, y: any): Array<typeof insiderTransactions.$inferInsert> {
  return (y?.insiderTransactions?.transactions ?? []).slice(0, 100).map((t: any) => ({
    stockId,
    filerName: safeStr(t.filerName, 255) ?? 'Unknown',
    filerRelation: safeStr(t.filerRelation, 100),
    transactionDate: safeDate(t.startDate) ?? new Date(),
    transactionText: safeStr(t.transactionText, 500),
    ownership: safeStr(t.ownership, 5),
    shares: safeInt(t.shares),
    value: safeNum(t.value),
  }));
}

function mapDividendInfo(stockId: string, y: any, tmx: TmxData): typeof dividendInfo.$inferInsert {
  const sd = y?.summaryDetail;
  const tq = tmx.quote;
  return {
    stockId,
    dividendYield: safeNum(sd?.dividendYield) ?? safeNum(tq?.dividendYield),
    dividendAmount: safeNum(sd?.dividendRate) ?? safeNum(tq?.dividendAmount),
    payoutRatio: safeNum(sd?.payoutRatio),
    exDividendDate: safeDate(sd?.exDividendDate) ?? safeDate(tq?.exDividendDate),
    dividendPayDate: safeDate(tq?.dividendPayDate),
    dividendFrequency: safeStr(tq?.dividendFrequency, 30),
    dividendCurrency: safeStr(tq?.dividendCurrency, 10) ?? safeStr(y?.price?.currency, 10),
    trailingAnnualDividendRate: safeNum(sd?.trailingAnnualDividendRate),
    trailingAnnualDividendYield: safeNum(sd?.trailingAnnualDividendYield),
    dividend3Years: null,
    dividend5Years: safeNum(sd?.fiveYearAvgDividendYield),
    updatedAt: new Date(),
  };
}

function mapCorporateEvents(stockId: string, y: any, tmx: TmxData): Array<typeof corporateEvents.$inferInsert> {
  const results: Array<typeof corporateEvents.$inferInsert> = [];

  for (const e of tmx.events) {
    const eventDate = safeDate(e.event_date);
    if (!eventDate) continue;
    results.push({
      stockId,
      eventType: safeStr(e.event_type, 20) ?? 'OTHER',
      eventName: safeStr(e.event_name, 500) ?? 'Unknown Event',
      eventDate,
      eventStatus: safeStr(e.event_status, 20),
      eventUrl: safeStr(e.event_url, 1000),
      sourceEventId: safeStr(e.event_id, 50),
      updatedAt: new Date(),
    });
  }

  // Yahoo earnings dates (supplement if not covered)
  for (const d of (y?.calendarEvents?.earnings?.earningsDate ?? [])) {
    const eventDate = safeDate(d);
    if (!eventDate) continue;
    const alreadyCovered = results.some(
      (r) => r.eventType === 'EAD' && Math.abs((r.eventDate as Date).getTime() - eventDate.getTime()) < 86400000
    );
    if (!alreadyCovered) {
      results.push({
        stockId, eventType: 'EAD', eventName: 'Earnings Announcement', eventDate,
        eventStatus: y?.calendarEvents?.earnings?.isEarningsDateEstimate ? 'UNC' : 'CON',
        eventUrl: null, sourceEventId: null, updatedAt: new Date(),
      });
    }
  }

  return results;
}

function mapStockNews(stockId: string, tmx: TmxData): Array<typeof stockNews.$inferInsert> {
  return tmx.news.map((n) => ({
    stockId,
    headline: safeStr(n.headline, 1000) ?? 'No headline',
    summary: safeStr(n.summary),
    source: safeStr(n.source, 255),
    publishedAt: safeDate(n.datetime) ?? new Date(),
    url: safeStr(n.newsUrl, 1000),
  }));
}

// ─── DB Upsert Functions ─────────────────────────────────────────────────────

async function upsertValuationMetrics(data: typeof valuationMetrics.$inferInsert): Promise<void> {
  await db!.insert(valuationMetrics).values(data).onConflictDoUpdate({
    target: valuationMetrics.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertAnalystConsensus(data: typeof analystConsensus.$inferInsert): Promise<void> {
  await db!.insert(analystConsensus).values(data).onConflictDoUpdate({
    target: analystConsensus.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertShortInterest(data: typeof shortInterest.$inferInsert): Promise<void> {
  await db!.insert(shortInterest).values(data).onConflictDoUpdate({
    target: shortInterest.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertMajorHoldersBreakdown(data: typeof majorHoldersBreakdown.$inferInsert): Promise<void> {
  await db!.insert(majorHoldersBreakdown).values(data).onConflictDoUpdate({
    target: majorHoldersBreakdown.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertDividendInfo(data: typeof dividendInfo.$inferInsert): Promise<void> {
  await db!.insert(dividendInfo).values(data).onConflictDoUpdate({
    target: dividendInfo.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertEarningsHistory(stockId: string, rows: Array<typeof earningsHistory.$inferInsert>): Promise<void> {
  for (const row of rows) {
    await db!.insert(earningsHistory).values(row).onConflictDoUpdate({
      target: [earningsHistory.stockId, earningsHistory.quarter],
      set: {
        period: row.period, currency: row.currency,
        epsActual: row.epsActual, epsEstimate: row.epsEstimate,
        epsDifference: row.epsDifference, surprisePercent: row.surprisePercent,
        updatedAt: new Date(),
      },
    });
  }
}

async function upsertEarningsEstimates(stockId: string, rows: Array<typeof earningsEstimates.$inferInsert>): Promise<void> {
  for (const row of rows) {
    await db!.insert(earningsEstimates).values(row).onConflictDoUpdate({
      target: [earningsEstimates.stockId, earningsEstimates.period],
      set: {
        endDate: row.endDate, currency: row.currency,
        epsAvg: row.epsAvg, epsLow: row.epsLow, epsHigh: row.epsHigh,
        epsYearAgo: row.epsYearAgo, epsGrowth: row.epsGrowth,
        numberOfAnalystsEps: row.numberOfAnalystsEps,
        revenueAvg: row.revenueAvg, revenueLow: row.revenueLow,
        revenueHigh: row.revenueHigh, revenueYearAgo: row.revenueYearAgo,
        revenueGrowth: row.revenueGrowth, numberOfAnalystsRevenue: row.numberOfAnalystsRevenue,
        epsTrendCurrent: row.epsTrendCurrent, epsTrend7dAgo: row.epsTrend7dAgo,
        epsTrend30dAgo: row.epsTrend30dAgo, epsTrend60dAgo: row.epsTrend60dAgo,
        epsTrend90dAgo: row.epsTrend90dAgo,
        revisionsUpLast7d: row.revisionsUpLast7d, revisionsUpLast30d: row.revisionsUpLast30d,
        revisionsDownLast7d: row.revisionsDownLast7d, revisionsDownLast30d: row.revisionsDownLast30d,
        updatedAt: new Date(),
      },
    });
  }
}

async function replaceRows(stockId: string, table: any, rows: any[]): Promise<void> {
  await db!.delete(table).where(eq(table.stockId, stockId));
  if (rows.length > 0) {
    // Insert in chunks of 50 to avoid query size limits
    for (let i = 0; i < rows.length; i += 50) {
      await db!.insert(table).values(rows.slice(i, i + 50));
    }
  }
}

// ─── Per-Ticker Orchestrator ─────────────────────────────────────────────────

async function processTicker(
  ticker: string,
  exchange: string,
  stockId: string,
): Promise<{ success: boolean; error?: string; yahooOk: boolean; tmxOk: boolean }> {
  const suffix = EXCHANGE_SUFFIX[exchange] ?? '.TO';
  const yfTicker = `${ticker}${suffix}`;

  try {
    // Fetch Yahoo and TMX sequentially to be extra conservative on rate limits
    const yahooData = await fetchYahooData(yfTicker);
    await sleep(200); // Small gap between Yahoo and TMX
    const tmxData = await fetchTmxData(ticker);

    const yahooOk = yahooData != null;
    const tmxOk = tmxData.quote != null || tmxData.analysts != null || tmxData.earnings != null;

    if (!yahooOk && !tmxOk) {
      return { success: false, error: 'No data from either source', yahooOk, tmxOk };
    }

    // Map all 13 tables
    const valuation = mapValuationMetrics(stockId, yahooData, tmxData);
    const ehRows = mapEarningsHistory(stockId, yahooData, tmxData);
    const eeRows = mapEarningsEstimates(stockId, yahooData);
    const consensus = mapAnalystConsensus(stockId, yahooData, tmxData);
    const actionRows = mapAnalystActions(stockId, yahooData);
    const si = mapShortInterest(stockId, tmxData);
    const ihRows = mapInstitutionalHolders(stockId, yahooData);
    const mhb = mapMajorHoldersBreakdown(stockId, yahooData);
    const insHoldRows = mapInsiderHoldings(stockId, yahooData);
    const insTransRows = mapInsiderTransactions(stockId, yahooData);
    const dividend = mapDividendInfo(stockId, yahooData, tmxData);
    const eventRows = mapCorporateEvents(stockId, yahooData, tmxData);
    const newsRows = mapStockNews(stockId, tmxData);

    // Upsert all (sequential to be safe with connection pool)
    await upsertValuationMetrics(valuation);
    if (ehRows.length > 0) await upsertEarningsHistory(stockId, ehRows);
    if (eeRows.length > 0) await upsertEarningsEstimates(stockId, eeRows);
    await upsertAnalystConsensus(consensus);
    if (actionRows.length > 0) await replaceRows(stockId, analystActions, actionRows);
    if (si) await upsertShortInterest(si);
    if (ihRows.length > 0) await replaceRows(stockId, institutionalHolders, ihRows);
    await upsertMajorHoldersBreakdown(mhb);
    if (insHoldRows.length > 0) await replaceRows(stockId, insiderHoldings, insHoldRows);
    if (insTransRows.length > 0) await replaceRows(stockId, insiderTransactions, insTransRows);
    await upsertDividendInfo(dividend);
    if (eventRows.length > 0) await replaceRows(stockId, corporateEvents, eventRows);
    if (newsRows.length > 0) await replaceRows(stockId, stockNews, newsRows);

    return { success: true, yahooOk, tmxOk };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg.slice(0, 200), yahooOk: false, tmxOk: false };
  }
}

// ─── Batch Processor ─────────────────────────────────────────────────────────

async function processAllTickers(
  allStocks: Array<{ id: string; ticker: string; exchange: string }>,
  progress: ProgressData,
): Promise<void> {
  const completedSet = new Set(progress.completed);
  const remaining = allStocks.filter((s) => !completedSet.has(s.ticker));

  log(`Total: ${allStocks.length} | Already completed: ${completedSet.size} | Remaining: ${remaining.length}`);

  let processed = 0;
  let yahooSucc = 0;
  let tmxSucc = 0;

  for (let i = 0; i < remaining.length; i += YAHOO_CONCURRENCY) {
    const batch = remaining.slice(i, i + YAHOO_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((s) => processTicker(s.ticker, s.exchange, s.id))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const stock = batch[j];
      processed++;

      if (result.status === 'fulfilled' && result.value.success) {
        progress.completed.push(stock.ticker);
        progress.stats.completed++;
        progress.stats.remaining--;
        if (result.value.yahooOk) yahooSucc++;
        if (result.value.tmxOk) tmxSucc++;
      } else {
        const error = result.status === 'rejected'
          ? String(result.reason?.message ?? result.reason).slice(0, 200)
          : (result.value?.error ?? 'Unknown error');
        progress.failed[stock.ticker] = error;
        progress.stats.failed++;
        progress.stats.remaining--;
      }
    }

    progress.stats.yahooHits += batch.length;
    progress.stats.tmxHits += batch.length;

    // Save progress every batch
    saveProgress(progress);

    // Log progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = remaining.length > processed
      ? Math.round((remaining.length - processed) / rate)
      : 0;
    const etaMin = Math.floor(eta / 60);
    const etaSec = eta % 60;
    log(`  ${progress.stats.completed}/${allStocks.length} done | ${processed} this run | Yahoo: ${yahooSucc} | TMX: ${tmxSucc} | Rate: ${rate.toFixed(2)}/s | ETA: ${etaMin}m${etaSec}s`);

    // Throttle between batches
    if (i + YAHOO_CONCURRENCY < remaining.length) {
      await sleep(YAHOO_DELAY_MS);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!db) {
    console.error('Database not available. Set DATABASE_URL in .env.production');
    process.exit(1);
  }

  log('═'.repeat(60));
  log('  VETTR Fundamentals Ingestion — Phase 5');
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Yahoo concurrency: ${YAHOO_CONCURRENCY} | Batch delay: ${YAHOO_DELAY_MS}ms`);
  log(`  TMX delay: ${TMX_DELAY_MS}ms | Retry backoffs: ${RETRY_DELAYS.join('/')}`);
  log('═'.repeat(60));

  // Load all stocks from DB
  const allStocks = await db
    .select({ id: stocks.id, ticker: stocks.ticker, exchange: stocks.exchange })
    .from(stocks)
    .orderBy(stocks.ticker);

  log(`Found ${allStocks.length} stocks in database`);

  // Load or create progress tracker
  const progress = loadProgress();
  progress.totalTickers = allStocks.length;
  progress.stats.remaining = allStocks.length - progress.stats.completed;

  startTime = Date.now();

  await processAllTickers(allStocks, progress);

  // Final save
  saveProgress(progress);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  log('');
  log('═'.repeat(60));
  log('  FINAL SUMMARY');
  log(`  Total tickers: ${allStocks.length}`);
  log(`  Completed: ${progress.stats.completed}`);
  log(`  Failed: ${progress.stats.failed}`);
  log(`  Duration: ${elapsedMin}m ${elapsedSec}s`);
  log('═'.repeat(60));

  // Print top failures
  const failedEntries = Object.entries(progress.failed);
  if (failedEntries.length > 0) {
    log(`\n  Top failures (${Math.min(20, failedEntries.length)} of ${failedEntries.length}):`);
    for (const [t, err] of failedEntries.slice(0, 20)) {
      log(`    ${t}: ${err}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    log(`FATAL: ${error}`);
    console.error(error);
    process.exit(1);
  });
