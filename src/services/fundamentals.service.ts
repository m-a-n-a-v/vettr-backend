import { eq, and, desc, asc, ne, sql, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  stocks,
  valuationMetrics,
  financialSummary,
  analystConsensus,
  analystActions,
  shortInterest,
  majorHoldersBreakdown,
  insiderTransactions,
  earningsHistory,
  earningsEstimates,
  dividendInfo,
  financialStatements,
} from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

// ─── Types (matching frontend FundamentalsData) ──────────────────────────────

interface FinancialHealth {
  cashRunwayMonths: number;
  debtCoverageRatio: number;
  workingCapitalTrend: Array<{ period: string; value: number }>;
  freeCashFlowYield: number;
  altmanZScore: number;
  currentRatio: number;
  quickRatio: number;
  interestCoverage: number;
  debtToEquity: number;
  debtToAssets: number;
  grossMargin: number;
  healthTrends: {
    cashRunway: number[];
    debtCoverage: number[];
    fcfYield: number[];
    currentRatio: number[];
    debtToEquity: number[];
    altmanZ: number[];
  };
}

interface EarningsQuality {
  accrualsRatio: number;
  cashConversion: number;
  revenueToReceivables: number;
  consecutiveBeats: number;
  surpriseHistory: Array<{
    quarter: string;
    epsActual: number;
    epsEstimate: number;
    surprise: number;
    surprisePercent: number;
  }>;
  overallScore: number;
  eqScoreHistory: number[];
}

interface AnalystConsensusData {
  totalAnalysts: number;
  consensus: string;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  priceTargetMean: number;
  priceTargetMedian: number;
  priceTargetHigh: number;
  priceTargetLow: number;
  currentPrice: number;
  upsidePercent: number;
  recommendations: Array<{
    period: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  }>;
  recentUpgrades: Array<{
    date: string;
    firm: string;
    action: 'upgrade' | 'downgrade' | 'initiate';
    fromGrade: string;
    toGrade: string;
  }>;
}

interface PeerFinancials {
  peers: Array<{
    ticker: string;
    name: string;
    peRatio: number;
    evEbitda: number;
    grossMargin: number;
    operatingMargin: number;
    revenueGrowth: number;
    roic: number;
    debtToEquity: number;
    currentScore: number;
    scoreTrend: number[];
  }>;
}

interface FinancialStatementsData {
  annualData: Array<{
    date: string;
    revenue: number;
    costOfRevenue: number;
    grossProfit: number;
    operatingIncome: number;
    netIncome: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    operatingCashFlow: number;
    capex: number;
    freeCashFlow: number;
  }>;
  trends: {
    revenue: number[];
    totalAssets: number[];
    freeCashFlow: number[];
  };
}

interface ShortInterestData {
  shortInterest: number;
  shortInterestPercent: number;
  daysToCover: number;
  asOfDate: string;
  shortInterestHistory: Array<{
    date: string;
    shortInterest: number;
    shortInterestPercent: number;
  }>;
  squeezePotential: 'high' | 'moderate' | 'low';
  shortInterestChange: number;
}

interface InsiderActivity {
  insidersPercent: number;
  institutionsPercent: number;
  publicPercent: number;
  netBuySellRatio: number;
  institutionChangePercent: number;
  topHoldersConcentration: number;
  smartMoneySignal: 'accumulating' | 'neutral' | 'distributing';
  quarterlyOwnershipHistory: Array<{
    quarter: string;
    insidersPercent: number;
    institutionsPercent: number;
  }>;
  recentTransactions: Array<{
    name: string;
    relation: string;
    type: 'buy' | 'sell';
    shares: number;
    date: string;
  }>;
}

interface ValuationMetricsData {
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseToRevenue: number | null;
  enterpriseToEbitda: number | null;
  enterpriseValue: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  beta: number | null;
  weeks52High: number | null;
  weeks52Low: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
}

export interface FundamentalsData {
  ticker: string;
  financialHealth: FinancialHealth;
  earningsQuality: EarningsQuality;
  analystConsensus: AnalystConsensusData;
  peerFinancials: PeerFinancials;
  financialStatements: FinancialStatementsData;
  peRatio: number;
  peRatioForward: number;
  dividendYield: number;
  shortInterest: ShortInterestData;
  insiderActivity: InsiderActivity;
  valuationMetrics: ValuationMetricsData;
  metricTrends: {
    marketCap: number[];
    peRatio: number[];
    dividendYield: number[];
    revenueGrowth: number[];
    price: number[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function n(val: number | null | undefined, fallback = 0): number {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return fallback;
  return val;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─── Main Service ────────────────────────────────────────────────────────────

export async function getFundamentals(ticker: string): Promise<FundamentalsData> {
  if (!db) throw new InternalError('Database not available');

  // 1. Look up stock
  const stockRows = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  const stock = stockRows[0];
  if (!stock) throw new NotFoundError(`Stock '${ticker}' not found`);

  const stockId = stock.id;

  // 2. Query all tables in parallel
  const [
    valMetrics,
    finSummary,
    analConsensus,
    analActions,
    si,
    mhb,
    insTrans,
    earnHist,
    earnEst,
    divInfo,
    annualIncome,
    annualBS,
    annualCF,
    peerStocks,
  ] = await Promise.all([
    db.select().from(valuationMetrics).where(eq(valuationMetrics.stockId, stockId)).limit(1),
    db.select().from(financialSummary).where(eq(financialSummary.stockId, stockId)).limit(1),
    db.select().from(analystConsensus).where(eq(analystConsensus.stockId, stockId)).limit(1),
    db.select().from(analystActions).where(eq(analystActions.stockId, stockId)).orderBy(desc(analystActions.actionDate)).limit(10),
    db.select().from(shortInterest).where(eq(shortInterest.stockId, stockId)).limit(1),
    db.select().from(majorHoldersBreakdown).where(eq(majorHoldersBreakdown.stockId, stockId)).limit(1),
    db.select().from(insiderTransactions).where(eq(insiderTransactions.stockId, stockId)).orderBy(desc(insiderTransactions.transactionDate)).limit(20),
    db.select().from(earningsHistory).where(eq(earningsHistory.stockId, stockId)).orderBy(desc(earningsHistory.quarter)).limit(8),
    db.select().from(earningsEstimates).where(eq(earningsEstimates.stockId, stockId)).limit(4),
    db.select().from(dividendInfo).where(eq(dividendInfo.stockId, stockId)).limit(1),
    // Annual income statement line items
    db.select().from(financialStatements).where(
      and(eq(financialStatements.stockId, stockId), eq(financialStatements.statementType, 'income'), eq(financialStatements.periodType, 'annual'))
    ),
    // Annual balance sheet line items
    db.select().from(financialStatements).where(
      and(eq(financialStatements.stockId, stockId), eq(financialStatements.statementType, 'balance_sheet'), eq(financialStatements.periodType, 'annual'))
    ),
    // Annual cash flow line items
    db.select().from(financialStatements).where(
      and(eq(financialStatements.stockId, stockId), eq(financialStatements.statementType, 'cash_flow'), eq(financialStatements.periodType, 'annual'))
    ),
    // Peers: same sector, different stock, limit 8
    db.select({
      id: stocks.id, ticker: stocks.ticker, name: stocks.name, vetrScore: stocks.vetrScore,
    }).from(stocks).where(
      and(eq(stocks.sector, stock.sector), ne(stocks.id, stockId))
    ).limit(8),
  ]);

  const vm = valMetrics[0] ?? null;
  const fs = finSummary[0] ?? null;
  const ac = analConsensus[0] ?? null;
  const siData = si[0] ?? null;
  const holders = mhb[0] ?? null;
  const div = divInfo[0] ?? null;
  const price = n(stock.price, 1);
  const marketCap = n(stock.marketCap, 1);

  // 3. Build financial statements from line items
  const financialStmts = buildFinancialStatements(annualIncome, annualBS, annualCF);

  // 4. Get peer metrics
  const peerData = await buildPeerFinancials(peerStocks);

  // 5. Assemble FundamentalsData
  return {
    ticker: stock.ticker,

    financialHealth: buildFinancialHealth(vm, fs, marketCap),
    earningsQuality: buildEarningsQuality(earnHist, fs),
    analystConsensus: buildAnalystConsensus(ac, analActions, price),
    peerFinancials: peerData,
    financialStatements: financialStmts,

    peRatio: n(vm?.peRatio),
    peRatioForward: n(vm?.forwardPE),
    dividendYield: n(div?.dividendYield) * 100, // convert decimal to percent

    shortInterest: buildShortInterest(siData),
    insiderActivity: buildInsiderActivity(holders, insTrans),

    valuationMetrics: {
      priceToBook: vm?.priceToBook ?? null,
      priceToSales: vm?.priceToSales ?? null,
      enterpriseToRevenue: vm?.enterpriseToRevenue ?? null,
      enterpriseToEbitda: vm?.enterpriseToEbitda ?? null,
      enterpriseValue: vm?.enterpriseValue ?? null,
      profitMargins: vm?.profitMargins ?? null,
      returnOnEquity: vm?.returnOnEquity ?? null,
      returnOnAssets: vm?.returnOnAssets ?? null,
      beta: vm?.beta ?? null,
      weeks52High: vm?.weeks52High ?? null,
      weeks52Low: vm?.weeks52Low ?? null,
      fiftyDayAverage: vm?.fiftyDayAverage ?? null,
      twoHundredDayAverage: vm?.twoHundredDayAverage ?? null,
      trailingEps: vm?.trailingEps ?? null,
      forwardEps: vm?.forwardEps ?? null,
    },

    metricTrends: {
      marketCap: [marketCap],
      peRatio: [n(vm?.peRatio)],
      dividendYield: [n(div?.dividendYield) * 100],
      revenueGrowth: [n(fs?.revenueGrowth) * 100],
      price: [price],
    },
  };
}

// ─── Section Builders ────────────────────────────────────────────────────────

function buildFinancialHealth(
  vm: typeof valuationMetrics.$inferSelect | null,
  fs: typeof financialSummary.$inferSelect | null,
  marketCap: number,
): FinancialHealth {
  const totalCash = n(fs?.totalCash);
  const totalDebt = n(fs?.totalDebt);
  const totalRevenue = n(fs?.totalRevenue, 1);
  const ebitda = n(fs?.ebitda);
  const fcf = n(fs?.freeCashFlow);
  const opCash = n(fs?.operatingCashFlow);
  const currentRatio = n(fs?.currentRatio, 1);
  const quickRatio = n(fs?.quickRatio, 0.5);
  const grossMargins = n(fs?.grossMargins);
  const debtToEquity = n(vm?.totalDebtToEquity);

  // Cash runway: totalCash / monthly burn (approximated from operating cash flow)
  const monthlyBurn = opCash < 0 ? Math.abs(opCash / 12) : 0;
  const cashRunway = monthlyBurn > 0 ? totalCash / monthlyBurn : totalCash > 0 ? 999 : 0;

  // Debt coverage: EBITDA / estimated interest expense
  const interestEst = totalDebt * 0.05; // approximate 5% interest rate
  const debtCoverage = interestEst > 0 ? ebitda / interestEst : ebitda > 0 ? 99 : 0;
  const interestCoverage = debtCoverage;

  // FCF yield
  const fcfYield = marketCap > 0 ? (fcf / marketCap) * 100 : 0;

  // Altman Z-Score (simplified): 1.2*(WC/TA) + 1.4*(RE/TA) + 3.3*(EBIT/TA) + 0.6*(MC/TL) + 1.0*(Rev/TA)
  // We approximate with available data
  const totalAssets = totalCash + totalDebt; // rough proxy
  const workingCapital = totalCash - (totalDebt * 0.3); // rough current portion
  const retainedEarnings = n(fs?.netIncome); // proxy
  const ebit = ebitda * 0.8; // rough EBIT from EBITDA

  let altmanZ = 3.0; // default "safe"
  if (totalAssets > 0) {
    altmanZ =
      1.2 * (workingCapital / totalAssets) +
      1.4 * (retainedEarnings / totalAssets) +
      3.3 * (ebit / totalAssets) +
      0.6 * (marketCap / Math.max(totalDebt, 1)) +
      1.0 * (totalRevenue / totalAssets);
    altmanZ = clamp(altmanZ, -5, 20);
  }

  const debtToAssets = totalAssets > 0 ? totalDebt / totalAssets : 0;

  return {
    cashRunwayMonths: Math.round(clamp(cashRunway, 0, 999)),
    debtCoverageRatio: Math.round(debtCoverage * 100) / 100,
    workingCapitalTrend: [{ period: 'Current', value: workingCapital }],
    freeCashFlowYield: Math.round(fcfYield * 100) / 100,
    altmanZScore: Math.round(altmanZ * 100) / 100,
    currentRatio: Math.round(currentRatio * 100) / 100,
    quickRatio: Math.round(quickRatio * 100) / 100,
    interestCoverage: Math.round(interestCoverage * 100) / 100,
    debtToEquity: Math.round(debtToEquity * 100) / 100,
    debtToAssets: Math.round(debtToAssets * 100) / 100,
    grossMargin: Math.round(grossMargins * 10000) / 10000, // keep as decimal 0-1
    healthTrends: {
      cashRunway: [clamp(cashRunway, 0, 999)],
      debtCoverage: [debtCoverage],
      fcfYield: [fcfYield],
      currentRatio: [currentRatio],
      debtToEquity: [debtToEquity],
      altmanZ: [altmanZ],
    },
  };
}

function buildEarningsQuality(
  history: (typeof earningsHistory.$inferSelect)[],
  fs: typeof financialSummary.$inferSelect | null,
): EarningsQuality {
  const opCash = n(fs?.operatingCashFlow);
  const netIncome = n(fs?.netIncome, 1);
  const revenue = n(fs?.totalRevenue, 1);

  const cashConversion = netIncome !== 0 ? opCash / netIncome : 0;
  const accrualsRatio = revenue > 0 ? (netIncome - opCash) / revenue : 0;
  const revenueToReceivables = revenue > 0 ? revenue / Math.max(revenue * 0.1, 1) : 0; // approximate

  // Consecutive beats
  let consecutiveBeats = 0;
  const sortedHistory = [...history].sort((a, b) =>
    new Date(b.quarter).getTime() - new Date(a.quarter).getTime()
  );
  for (const h of sortedHistory) {
    if (n(h.surprisePercent) > 0) consecutiveBeats++;
    else break;
  }

  // Surprise history
  const surpriseHistory = sortedHistory.slice(0, 6).map(h => ({
    quarter: h.quarter.toISOString().slice(0, 10),
    epsActual: n(h.epsActual),
    epsEstimate: n(h.epsEstimate),
    surprise: n(h.epsDifference),
    surprisePercent: n(h.surprisePercent),
  }));

  // Overall EQ score: weighted composite (0-100)
  const cashConvScore = clamp(cashConversion * 30, 0, 40); // 40% weight
  const beatsScore = clamp(consecutiveBeats * 10, 0, 30); // 30% weight
  const accrualsScore = clamp((1 - Math.abs(accrualsRatio)) * 30, 0, 30); // 30% weight
  const overallScore = Math.round(clamp(cashConvScore + beatsScore + accrualsScore, 0, 100));

  return {
    accrualsRatio: Math.round(accrualsRatio * 10000) / 10000,
    cashConversion: Math.round(cashConversion * 100) / 100,
    revenueToReceivables: Math.round(revenueToReceivables * 100) / 100,
    consecutiveBeats,
    surpriseHistory,
    overallScore,
    eqScoreHistory: [overallScore],
  };
}

function buildAnalystConsensus(
  ac: typeof analystConsensus.$inferSelect | null,
  actions: (typeof analystActions.$inferSelect)[],
  currentPrice: number,
): AnalystConsensusData {
  const ptMean = n(ac?.priceTarget);
  const upside = currentPrice > 0 && ptMean > 0 ? ((ptMean - currentPrice) / currentPrice) * 100 : 0;

  const recommendations = (ac?.recommendationTrend ?? []).map(t => ({
    period: t.period,
    strongBuy: t.strongBuy ?? 0,
    buy: t.buy ?? 0,
    hold: t.hold ?? 0,
    sell: t.sell ?? 0,
    strongSell: t.strongSell ?? 0,
  }));

  const recentUpgrades = actions.slice(0, 5).map(a => {
    let action: 'upgrade' | 'downgrade' | 'initiate' = 'initiate';
    const act = (a.action ?? '').toLowerCase();
    if (act.includes('up') || act === 'upgrade') action = 'upgrade';
    else if (act.includes('down') || act === 'downgrade') action = 'downgrade';
    else if (act.includes('init') || act === 'main' || act === 'reit') action = 'initiate';

    return {
      date: a.actionDate.toISOString().slice(0, 10),
      firm: a.firm,
      action,
      fromGrade: a.fromGrade ?? '',
      toGrade: a.toGrade ?? '',
    };
  });

  return {
    totalAnalysts: n(ac?.totalAnalysts),
    consensus: ac?.consensus ?? 'N/A',
    buyCount: n(ac?.buyCount),
    holdCount: n(ac?.holdCount),
    sellCount: n(ac?.sellCount),
    priceTargetMean: ptMean,
    priceTargetMedian: ptMean, // TMX doesn't provide median separately
    priceTargetHigh: n(ac?.priceTargetHigh),
    priceTargetLow: n(ac?.priceTargetLow),
    currentPrice,
    upsidePercent: Math.round(upside * 100) / 100,
    recommendations,
    recentUpgrades,
  };
}

function buildFinancialStatements(
  incomeRows: (typeof financialStatements.$inferSelect)[],
  bsRows: (typeof financialStatements.$inferSelect)[],
  cfRows: (typeof financialStatements.$inferSelect)[],
): FinancialStatementsData {
  // Group rows by fiscal date
  const dates = new Set<string>();
  for (const r of [...incomeRows, ...bsRows, ...cfRows]) {
    dates.add(String(r.fiscalDate));
  }
  const sortedDates = [...dates].sort().reverse().slice(0, 4); // Most recent 4 years

  function getVal(rows: (typeof financialStatements.$inferSelect)[], date: string, lineItem: string): number {
    const row = rows.find(r => String(r.fiscalDate) === date && r.lineItem === lineItem);
    return n(row?.value);
  }

  const annualData = sortedDates.map(date => {
    const revenue = getVal(incomeRows, date, 'totalRevenue');
    const costOfRev = getVal(incomeRows, date, 'costOfRevenue');
    const grossProfit = getVal(incomeRows, date, 'grossProfit') || (revenue - costOfRev);
    const opIncome = getVal(incomeRows, date, 'operatingIncome');
    const netIncome = getVal(incomeRows, date, 'netIncome') || getVal(incomeRows, date, 'netIncomeCommonStockholders');
    const totalAssets = getVal(bsRows, date, 'totalAssets');
    const totalLiab = getVal(bsRows, date, 'totalLiabilitiesNetMinorityInterest') || getVal(bsRows, date, 'totalLiab');
    const totalEquity = getVal(bsRows, date, 'stockholdersEquity') || getVal(bsRows, date, 'commonStockEquity') || (totalAssets - totalLiab);
    const opCF = getVal(cfRows, date, 'operatingCashFlow');
    const capex = Math.abs(getVal(cfRows, date, 'capitalExpenditure'));
    const fcf = getVal(cfRows, date, 'freeCashFlow') || (opCF - capex);

    return {
      date: date.slice(0, 4), // Just the year
      revenue, costOfRevenue: costOfRev, grossProfit, operatingIncome: opIncome,
      netIncome, totalAssets, totalLiabilities: totalLiab, totalEquity,
      operatingCashFlow: opCF, capex, freeCashFlow: fcf,
    };
  });

  return {
    annualData,
    trends: {
      revenue: annualData.map(d => d.revenue).reverse(),
      totalAssets: annualData.map(d => d.totalAssets).reverse(),
      freeCashFlow: annualData.map(d => d.freeCashFlow).reverse(),
    },
  };
}

function buildShortInterest(
  si: typeof shortInterest.$inferSelect | null,
): ShortInterestData {
  const siPct = n(si?.shortInterestPct) * 100; // convert to percentage
  const dtc = n(si?.daysToCover30d) || n(si?.daysToCover10d);

  let squeezePotential: 'high' | 'moderate' | 'low' = 'low';
  if (siPct > 20) squeezePotential = 'high';
  else if (siPct > 10) squeezePotential = 'moderate';

  return {
    shortInterest: n(si?.shortShares),
    shortInterestPercent: Math.round(siPct * 100) / 100,
    daysToCover: Math.round(dtc * 100) / 100,
    asOfDate: si?.reportDate?.toISOString().slice(0, 10) ?? '',
    shortInterestHistory: si ? [{
      date: si.reportDate?.toISOString().slice(0, 10) ?? '',
      shortInterest: n(si.shortShares),
      shortInterestPercent: Math.round(siPct * 100) / 100,
    }] : [],
    squeezePotential,
    shortInterestChange: 0, // single snapshot, no historical delta available
  };
}

function buildInsiderActivity(
  holders: typeof majorHoldersBreakdown.$inferSelect | null,
  transactions: (typeof insiderTransactions.$inferSelect)[],
): InsiderActivity {
  const insidersPct = n(holders?.insidersPercentHeld) * 100;
  const instPct = n(holders?.institutionsPercentHeld) * 100;
  const publicPct = Math.max(0, 100 - insidersPct - instPct);

  // Net buy/sell from recent transactions
  let netBuyShares = 0;
  let netSellShares = 0;
  for (const t of transactions) {
    const text = (t.transactionText ?? '').toLowerCase();
    const shares = n(t.shares);
    if (text.includes('purchase') || text.includes('buy') || text.includes('acquisition')) {
      netBuyShares += shares;
    } else if (text.includes('sale') || text.includes('sell') || text.includes('disposition')) {
      netSellShares += shares;
    }
  }
  const totalActivity = netBuyShares + netSellShares;
  const netBuySellRatio = totalActivity > 0 ? (netBuyShares - netSellShares) / totalActivity : 0;

  let smartMoneySignal: 'accumulating' | 'neutral' | 'distributing' = 'neutral';
  if (netBuySellRatio > 0.2) smartMoneySignal = 'accumulating';
  else if (netBuySellRatio < -0.2) smartMoneySignal = 'distributing';

  // Top holders concentration (approximate from institutions count)
  const instCount = n(holders?.institutionsCount, 1);
  const topHoldersConcentration = instCount > 0 ? Math.min(instPct * (5 / instCount), instPct) : 0;

  const recentTransactions = transactions.slice(0, 10).map(t => {
    const text = (t.transactionText ?? '').toLowerCase();
    const isBuy = text.includes('purchase') || text.includes('buy') || text.includes('acquisition');
    return {
      name: t.filerName,
      relation: t.filerRelation ?? 'Unknown',
      type: (isBuy ? 'buy' : 'sell') as 'buy' | 'sell',
      shares: Math.abs(n(t.shares)),
      date: t.transactionDate.toISOString().slice(0, 10),
    };
  });

  return {
    insidersPercent: Math.round(insidersPct * 100) / 100,
    institutionsPercent: Math.round(instPct * 100) / 100,
    publicPercent: Math.round(publicPct * 100) / 100,
    netBuySellRatio: Math.round(netBuySellRatio * 100) / 100,
    institutionChangePercent: 0, // no historical tracking yet
    topHoldersConcentration: Math.round(topHoldersConcentration * 100) / 100,
    smartMoneySignal,
    quarterlyOwnershipHistory: [{
      quarter: 'Current',
      insidersPercent: Math.round(insidersPct * 100) / 100,
      institutionsPercent: Math.round(instPct * 100) / 100,
    }],
    recentTransactions,
  };
}

async function buildPeerFinancials(
  peerStocks: Array<{ id: string; ticker: string; name: string; vetrScore: number | null }>,
): Promise<PeerFinancials> {
  if (!db || peerStocks.length === 0) return { peers: [] };

  const peerIds = peerStocks.map(p => p.id);

  // Fetch valuation metrics and financial summaries for peers
  const [peerVM, peerFS] = await Promise.all([
    db.select().from(valuationMetrics).where(inArray(valuationMetrics.stockId, peerIds)),
    db.select().from(financialSummary).where(inArray(financialSummary.stockId, peerIds)),
  ]);

  const vmMap = new Map(peerVM.map(v => [v.stockId, v]));
  const fsMap = new Map(peerFS.map(f => [f.stockId, f]));

  const peers = peerStocks.map(p => {
    const pvm = vmMap.get(p.id);
    const pfs = fsMap.get(p.id);
    return {
      ticker: p.ticker,
      name: p.name,
      peRatio: n(pvm?.peRatio),
      evEbitda: n(pvm?.enterpriseToEbitda),
      grossMargin: n(pfs?.grossMargins) * 100,
      operatingMargin: n(pfs?.operatingMargins) * 100,
      revenueGrowth: n(pfs?.revenueGrowth) * 100,
      roic: n(pvm?.returnOnEquity) * 100, // approximate ROIC with ROE
      debtToEquity: n(pvm?.totalDebtToEquity),
      currentScore: n(p.vetrScore),
      scoreTrend: [n(p.vetrScore)],
    };
  }).filter(p => p.peRatio > 0 || p.grossMargin > 0); // filter out empty peers

  return { peers: peers.slice(0, 8) };
}
