/**
 * AI Agent Response Generators
 * Pre-defined template-based responses for stock analysis questions
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  stocks,
  financialSummary,
  valuationMetrics,
  analystConsensus,
  analystActions,
  majorHoldersBreakdown,
  institutionalHolders,
  insiderTransactions,
} from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiAgentResponseData {
  summary: string;
  details: Array<{
    label: string;
    value: string;
    status: 'safe' | 'warning' | 'danger' | 'neutral';
  }>;
  verdict: string;
  verdict_color: 'green' | 'yellow' | 'red';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Null-safe numeric helper — use everywhere to avoid NaN/Infinity issues
 */
function n(val: number | null | undefined, fallback = 0): number {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return fallback;
  return val;
}

/**
 * Format number with commas and optional decimal places
 */
function formatNumber(num: number, decimals = 2): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format large numbers as billions/millions
 */
function formatLargeNumber(num: number): string {
  if (num >= 1e9) return `$${formatNumber(num / 1e9, 1)}B`;
  if (num >= 1e6) return `$${formatNumber(num / 1e6, 1)}M`;
  return `$${formatNumber(num, 0)}`;
}

/**
 * Get stock by ticker or throw NotFoundError
 */
async function getStockByTicker(ticker: string) {
  if (!db) throw new InternalError('Database not available');

  const [stock] = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  if (!stock) {
    throw new NotFoundError(`Stock '${ticker}' not found`);
  }

  return stock;
}

// ─── Financial Health Responders ─────────────────────────────────────────────

/**
 * US-088: Financial Health Overview
 * Returns Altman Z-Score classification, cash runway, current ratio, debt metrics, FCF yield
 */
export async function respondFinancialHealth(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  // Parallel queries for performance
  const [valMetrics, finSummary] = await Promise.all([
    db.select().from(valuationMetrics).where(eq(valuationMetrics.stockId, stock.id)).limit(1),
    db.select().from(financialSummary).where(eq(financialSummary.stockId, stock.id)).limit(1),
  ]);

  const val = valMetrics[0];
  const fin = finSummary[0];

  // Calculate Altman Z-Score (simplified version)
  // Z = 1.2×(WC/TA) + 1.4×(RE/TA) + 3.3×(EBIT/TA) + 0.6×(ME/TL) + 1.0×(S/TA)
  // Simplified: Z ≈ 3.3 + 1.0×CurrentRatio - 1.5×DebtToEquity + 2×(FCF/Revenue)
  const currentRatio = n(fin?.currentRatio, 1.0);
  const debtToEquity = n(val?.totalDebtToEquity, 0);
  const fcfYield = fin?.freeCashFlow && fin?.totalRevenue
    ? n(fin.freeCashFlow / fin.totalRevenue, 0)
    : 0;
  const altmanZ = 3.3 + 1.0 * currentRatio - 1.5 * (debtToEquity / 100) + 2 * fcfYield;

  // Cash runway (months of operations covered by cash)
  const cashRunway = fin?.totalCash && fin?.operatingCashFlow
    ? Math.round((n(fin.totalCash) / (n(fin.operatingCashFlow) / 12)) * 10) / 10
    : 0;

  // FCF Yield as percentage
  const fcfYieldPercent = fin?.freeCashFlow && stock.marketCap
    ? (n(fin.freeCashFlow) / n(stock.marketCap)) * 100
    : 0;

  // Determine verdict
  let verdict = 'Moderate';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let healthAssessment = 'moderate financial health';

  if (altmanZ > 2.99) {
    verdict = 'Strong';
    verdict_color = 'green';
    healthAssessment = '**strong financial health**';
  } else if (altmanZ < 1.81) {
    verdict = 'Caution';
    verdict_color = 'red';
    healthAssessment = 'financial distress signals';
  }

  // Build summary
  const summary = `**${stock.name}** is in ${healthAssessment}. With an Altman Z-Score of **${formatNumber(altmanZ, 1)}** (${
    altmanZ > 2.99 ? 'Safe Zone' : altmanZ > 1.81 ? 'Grey Zone' : 'Distress Zone'
  }) and **${cashRunway > 0 ? cashRunway.toFixed(1) : 'N/A'}** months of cash runway, the company ${
    cashRunway > 12 ? 'has a solid financial cushion' : 'should monitor cash flow closely'
  }. The current ratio of **${formatNumber(currentRatio, 2)}** and ${
    debtToEquity < 50 ? 'low' : debtToEquity < 100 ? 'moderate' : 'elevated'
  } debt-to-equity of **${formatNumber(debtToEquity, 1)}%** suggest ${
    debtToEquity < 50 ? 'minimal' : debtToEquity < 100 ? 'manageable' : 'elevated'
  } solvency risk.`;

  // Build details
  const details = [
    {
      label: 'Altman Z-Score',
      value: formatNumber(altmanZ, 2),
      status: (altmanZ > 2.99 ? 'safe' : altmanZ > 1.81 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Cash Runway',
      value: cashRunway > 0 ? `${cashRunway.toFixed(1)} months` : 'N/A',
      status: (cashRunway > 12 ? 'safe' : cashRunway > 6 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Current Ratio',
      value: formatNumber(currentRatio, 2),
      status: (currentRatio > 1.5 ? 'safe' : currentRatio > 1.0 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Debt-to-Equity',
      value: `${formatNumber(debtToEquity, 1)}%`,
      status: (debtToEquity < 50 ? 'safe' : debtToEquity < 100 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'FCF Yield',
      value: `${formatNumber(fcfYieldPercent, 2)}%`,
      status: (fcfYieldPercent > 5 ? 'safe' : fcfYieldPercent > 0 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

/**
 * US-088: Debt Analysis (Follow-up)
 * Deeper debt focus: debt-to-equity, debt-to-assets, interest coverage, gross margin
 */
export async function respondDebtAnalysis(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  const [valMetrics, finSummary] = await Promise.all([
    db.select().from(valuationMetrics).where(eq(valuationMetrics.stockId, stock.id)).limit(1),
    db.select().from(financialSummary).where(eq(financialSummary.stockId, stock.id)).limit(1),
  ]);

  const val = valMetrics[0];
  const fin = finSummary[0];

  const debtToEquity = n(val?.totalDebtToEquity, 0);
  const totalDebt = n(fin?.totalDebt, 0);
  const totalAssets = totalDebt > 0 && debtToEquity > 0
    ? totalDebt / (debtToEquity / 100)
    : 0;
  const debtToAssets = totalAssets > 0 ? (totalDebt / totalAssets) * 100 : 0;

  // Interest coverage (EBITDA / Interest Expense) — approximate as EBITDA / (Debt × 5%)
  const estimatedInterest = totalDebt * 0.05;
  const interestCoverage = estimatedInterest > 0 && fin?.ebitda
    ? n(fin.ebitda) / estimatedInterest
    : 0;

  const grossMargin = n(fin?.grossMargins, 0) * 100;

  // Verdict
  let verdict = 'Moderate';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';

  if (debtToEquity < 30 && interestCoverage > 5) {
    verdict = 'Healthy';
    verdict_color = 'green';
  } else if (debtToEquity > 150 || interestCoverage < 2) {
    verdict = 'Elevated';
    verdict_color = 'red';
  }

  const summary = `**${stock.name}** carries ${
    debtToEquity < 30 ? 'minimal' : debtToEquity < 100 ? 'moderate' : 'significant'
  } debt. With a debt-to-equity ratio of **${formatNumber(debtToEquity, 1)}%** and debt-to-assets of **${formatNumber(debtToAssets, 1)}%**, the company's leverage is ${
    debtToEquity < 50 ? 'well-controlled' : debtToEquity < 100 ? 'within acceptable levels' : 'elevated'
  }. ${
    interestCoverage > 5
      ? `Strong interest coverage of **${formatNumber(interestCoverage, 1)}x** suggests debt is easily serviceable.`
      : interestCoverage > 2
      ? `Interest coverage of **${formatNumber(interestCoverage, 1)}x** is adequate but should be monitored.`
      : `Low interest coverage of **${formatNumber(interestCoverage, 1)}x** raises concerns about debt serviceability.`
  }`;

  const details = [
    {
      label: 'Debt-to-Equity',
      value: `${formatNumber(debtToEquity, 1)}%`,
      status: (debtToEquity < 50 ? 'safe' : debtToEquity < 100 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Debt-to-Assets',
      value: `${formatNumber(debtToAssets, 1)}%`,
      status: (debtToAssets < 30 ? 'safe' : debtToAssets < 60 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Interest Coverage',
      value: `${formatNumber(interestCoverage, 1)}x`,
      status: (interestCoverage > 5 ? 'safe' : interestCoverage > 2 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Gross Margin',
      value: `${formatNumber(grossMargin, 1)}%`,
      status: (grossMargin > 40 ? 'safe' : grossMargin > 20 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Total Debt',
      value: totalDebt > 0 ? formatLargeNumber(totalDebt) : 'N/A',
      status: 'neutral' as 'neutral',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

/**
 * US-088: Cash Position (Follow-up)
 * Cash runway, operating cash flow, free cash flow, FCF yield with trend context
 */
export async function respondCashPosition(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  const [finSummary] = await Promise.all([
    db.select().from(financialSummary).where(eq(financialSummary.stockId, stock.id)).limit(1),
  ]);

  const fin = finSummary[0];

  const totalCash = n(fin?.totalCash, 0);
  const operatingCF = n(fin?.operatingCashFlow, 0);
  const freeCF = n(fin?.freeCashFlow, 0);
  const cashRunway = operatingCF > 0 ? (totalCash / (operatingCF / 12)) : 0;
  const fcfYieldPercent = stock.marketCap && freeCF > 0
    ? (freeCF / n(stock.marketCap)) * 100
    : 0;

  // Verdict
  let verdict = 'Stable';
  let verdict_color: 'green' | 'yellow' | 'red' = 'green';

  if (cashRunway < 6 || freeCF < 0) {
    verdict = 'Tight';
    verdict_color = 'red';
  } else if (cashRunway < 12) {
    verdict = 'Adequate';
    verdict_color = 'yellow';
  }

  const summary = `**${stock.name}** has ${
    totalCash > 0 ? `**${formatLargeNumber(totalCash)}** in cash` : 'limited cash reserves'
  }, providing **${cashRunway > 0 ? cashRunway.toFixed(1) : '0'}** months of runway based on operating cash flow. ${
    freeCF > 0
      ? `The company generates **${formatLargeNumber(freeCF)}** in free cash flow annually, yielding **${formatNumber(fcfYieldPercent, 2)}%**.`
      : `Free cash flow is ${freeCF < 0 ? 'negative, indicating cash burn' : 'not available'}.`
  } ${
    cashRunway > 12 && freeCF > 0
      ? 'Strong cash position supports growth and shareholder returns.'
      : cashRunway > 6
      ? 'Cash position is adequate but requires monitoring.'
      : 'Cash runway is tight — watch for financing needs.'
  }`;

  const details = [
    {
      label: 'Total Cash',
      value: totalCash > 0 ? formatLargeNumber(totalCash) : 'N/A',
      status: (totalCash > 1e9 ? 'safe' : totalCash > 1e8 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Cash Runway',
      value: cashRunway > 0 ? `${cashRunway.toFixed(1)} months` : 'N/A',
      status: (cashRunway > 12 ? 'safe' : cashRunway > 6 ? 'warning' : 'danger') as 'safe' | 'warning' | 'danger',
    },
    {
      label: 'Operating Cash Flow',
      value: operatingCF > 0 ? formatLargeNumber(operatingCF) : operatingCF < 0 ? `(${formatLargeNumber(Math.abs(operatingCF))})` : 'N/A',
      status: (operatingCF > 0 ? 'safe' : 'danger') as 'safe' | 'danger',
    },
    {
      label: 'Free Cash Flow',
      value: freeCF > 0 ? formatLargeNumber(freeCF) : freeCF < 0 ? `(${formatLargeNumber(Math.abs(freeCF))})` : 'N/A',
      status: (freeCF > 0 ? 'safe' : 'danger') as 'safe' | 'danger',
    },
    {
      label: 'FCF Yield',
      value: `${formatNumber(fcfYieldPercent, 2)}%`,
      status: (fcfYieldPercent > 5 ? 'safe' : fcfYieldPercent > 0 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

// ─── Analyst Consensus Responders ────────────────────────────────────────────

/**
 * US-089: Analyst View Overview
 * Returns consensus rating, total analysts, buy/hold/sell breakdown, price target, upside/downside %
 */
export async function respondAnalystView(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  const [consensus] = await db
    .select()
    .from(analystConsensus)
    .where(eq(analystConsensus.stockId, stock.id))
    .limit(1);

  if (!consensus) {
    return {
      summary: `**${stock.name}** currently has no analyst coverage available.`,
      details: [],
      verdict: 'Unknown',
      verdict_color: 'yellow',
    };
  }

  const totalAnalysts = n(consensus.totalAnalysts, 0);
  const buyCount = n(consensus.buyCount, 0);
  const holdCount = n(consensus.holdCount, 0);
  const sellCount = n(consensus.sellCount, 0);
  const priceTarget = n(consensus.priceTarget, 0);
  const currentPrice = n(stock.price, 0);
  const upside = currentPrice > 0 && priceTarget > 0
    ? ((priceTarget - currentPrice) / currentPrice) * 100
    : 0;

  // Determine verdict based on consensus and upside
  let verdict = 'Hold';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let sentiment = 'cautiously optimistic';

  if (consensus.consensus === 'Buy' && upside > 20) {
    verdict = 'Strong Buy';
    verdict_color = 'green';
    sentiment = '**bullish**';
  } else if (consensus.consensus === 'Buy' && upside > 0) {
    verdict = 'Buy';
    verdict_color = 'green';
    sentiment = 'optimistic';
  } else if (consensus.consensus === 'Sell' || upside < -10) {
    verdict = 'Sell';
    verdict_color = 'red';
    sentiment = 'bearish';
  } else if (consensus.consensus === 'Hold') {
    sentiment = 'mixed';
  }

  const summary = `Analysts are ${sentiment} on **${stock.name}**. Of **${totalAnalysts} analysts**, the split is **${buyCount} Buy / ${holdCount} Hold / ${sellCount} Sell** with a consensus of **${consensus.consensus || 'N/A'}**. The average price target of **$${formatNumber(priceTarget, 2)}** represents **${upside > 0 ? '+' : ''}${formatNumber(upside, 1)}% ${upside > 0 ? 'upside' : 'downside'}** from the current price of **$${formatNumber(currentPrice, 2)}**.`;

  const details = [
    {
      label: 'Consensus',
      value: consensus.consensus || 'N/A',
      status: (consensus.consensus === 'Buy' ? 'safe' : consensus.consensus === 'Sell' ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
    {
      label: 'Total Analysts',
      value: totalAnalysts.toString(),
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Buy / Hold / Sell',
      value: `${buyCount} / ${holdCount} / ${sellCount}`,
      status: (buyCount > holdCount + sellCount ? 'safe' : sellCount > buyCount ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
    {
      label: 'Price Target',
      value: `$${formatNumber(priceTarget, 2)}`,
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Upside/Downside',
      value: `${upside > 0 ? '+' : ''}${formatNumber(upside, 1)}%`,
      status: (upside > 20 ? 'safe' : upside > 0 ? 'neutral' : upside > -10 ? 'warning' : 'danger') as 'safe' | 'neutral' | 'warning' | 'danger',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

/**
 * US-089: Recent Analyst Actions (Follow-up)
 * Returns last 5 analyst actions with firm names, action type, grade changes, dates
 */
export async function respondRecentActions(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  const actions = await db
    .select()
    .from(analystActions)
    .where(eq(analystActions.stockId, stock.id))
    .orderBy(desc(analystActions.actionDate))
    .limit(5);

  if (actions.length === 0) {
    return {
      summary: `**${stock.name}** has no recent analyst actions on record.`,
      details: [],
      verdict: 'Unknown',
      verdict_color: 'yellow',
    };
  }

  // Count upgrades vs downgrades
  let upgradeCount = 0;
  let downgradeCount = 0;
  let initiateCount = 0;

  actions.forEach((action) => {
    if (action.action === 'up') upgradeCount++;
    else if (action.action === 'down') downgradeCount++;
    else if (action.action === 'init') initiateCount++;
  });

  // Determine verdict
  let verdict = 'Mixed';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let sentiment = 'mixed signals';

  if (upgradeCount > downgradeCount && upgradeCount >= 2) {
    verdict = 'Positive';
    verdict_color = 'green';
    sentiment = '**positive momentum**';
  } else if (downgradeCount > upgradeCount && downgradeCount >= 2) {
    verdict = 'Negative';
    verdict_color = 'red';
    sentiment = 'negative sentiment';
  }

  const mostRecentAction = actions[0];
  const mostRecentDate = new Date(mostRecentAction.actionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const mostRecentFirm = mostRecentAction.firm;
  const mostRecentType = mostRecentAction.action === 'up' ? 'upgraded' : mostRecentAction.action === 'down' ? 'downgraded' : 'initiated coverage on';

  const summary = `Recent analyst activity shows ${sentiment} for **${stock.name}**. In the last 5 actions, there were **${upgradeCount} upgrades**, **${downgradeCount} downgrades**, and **${initiateCount} initiations**. Most recently, **${mostRecentFirm}** ${mostRecentType} the stock on **${mostRecentDate}**${mostRecentAction.toGrade ? ` to **${mostRecentAction.toGrade}**` : ''}.`;

  const details = actions.map((action) => {
    const date = new Date(action.actionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const actionType = action.action === 'up' ? 'Upgrade' : action.action === 'down' ? 'Downgrade' : action.action === 'init' ? 'Initiate' : 'Maintain';
    const gradeChange = action.fromGrade && action.toGrade
      ? `${action.fromGrade} → ${action.toGrade}`
      : action.toGrade || 'N/A';

    return {
      label: `${action.firm} (${date})`,
      value: `${actionType}: ${gradeChange}`,
      status: (action.action === 'up' ? 'safe' : action.action === 'down' ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    };
  });

  return { summary, details, verdict, verdict_color };
}

/**
 * US-089: Price Targets (Follow-up)
 * Returns price target mean/high/low, current price, upside %, consensus vs current price
 */
export async function respondPriceTargets(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  const [consensus] = await db
    .select()
    .from(analystConsensus)
    .where(eq(analystConsensus.stockId, stock.id))
    .limit(1);

  if (!consensus || !consensus.priceTarget) {
    return {
      summary: `**${stock.name}** has no price target data available.`,
      details: [],
      verdict: 'Unknown',
      verdict_color: 'yellow',
    };
  }

  const priceTarget = n(consensus.priceTarget, 0);
  const priceTargetHigh = n(consensus.priceTargetHigh, 0);
  const priceTargetLow = n(consensus.priceTargetLow, 0);
  const currentPrice = n(stock.price, 0);
  const upside = currentPrice > 0 && priceTarget > 0
    ? ((priceTarget - currentPrice) / currentPrice) * 100
    : 0;
  const highUpside = currentPrice > 0 && priceTargetHigh > 0
    ? ((priceTargetHigh - currentPrice) / currentPrice) * 100
    : 0;
  const lowUpside = currentPrice > 0 && priceTargetLow > 0
    ? ((priceTargetLow - currentPrice) / currentPrice) * 100
    : 0;

  // Determine verdict
  let verdict = 'Neutral';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let assessment = 'fairly valued';

  if (upside > 20) {
    verdict = 'Undervalued';
    verdict_color = 'green';
    assessment = '**undervalued**';
  } else if (upside > 10) {
    verdict = 'Slight Upside';
    verdict_color = 'green';
    assessment = 'trading below target';
  } else if (upside < -10) {
    verdict = 'Overvalued';
    verdict_color = 'red';
    assessment = '**overvalued**';
  } else if (upside < 0) {
    verdict = 'At Target';
    verdict_color = 'yellow';
    assessment = 'near or above target';
  }

  const summary = `Analysts see **${stock.name}** as ${assessment}. The consensus price target of **$${formatNumber(priceTarget, 2)}** implies **${upside > 0 ? '+' : ''}${formatNumber(upside, 1)}% ${upside > 0 ? 'upside' : 'downside'}** from the current price of **$${formatNumber(currentPrice, 2)}**. Price targets range from a low of **$${formatNumber(priceTargetLow, 2)}** (${lowUpside > 0 ? '+' : ''}${formatNumber(lowUpside, 1)}%) to a high of **$${formatNumber(priceTargetHigh, 2)}** (${highUpside > 0 ? '+' : ''}${formatNumber(highUpside, 1)}%).`;

  const details = [
    {
      label: 'Current Price',
      value: `$${formatNumber(currentPrice, 2)}`,
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Target Price (Mean)',
      value: `$${formatNumber(priceTarget, 2)}`,
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Target High',
      value: `$${formatNumber(priceTargetHigh, 2)}`,
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Target Low',
      value: `$${formatNumber(priceTargetLow, 2)}`,
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Implied Upside',
      value: `${upside > 0 ? '+' : ''}${formatNumber(upside, 1)}%`,
      status: (upside > 20 ? 'safe' : upside > 0 ? 'neutral' : upside > -10 ? 'warning' : 'danger') as 'safe' | 'neutral' | 'warning' | 'danger',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

// ─── Insider Activity Responders ─────────────────────────────────────────────

/**
 * US-090: Insider Activity Overview
 * Returns ownership breakdown (insider/institutional/public %), net buy/sell ratio, recent transaction summary
 */
export async function respondInsiderActivity(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  // Parallel queries for performance
  const [breakdown, recentTransactions] = await Promise.all([
    db.select().from(majorHoldersBreakdown).where(eq(majorHoldersBreakdown.stockId, stock.id)).limit(1),
    db.select().from(insiderTransactions)
      .where(eq(insiderTransactions.stockId, stock.id))
      .orderBy(desc(insiderTransactions.transactionDate))
      .limit(10),
  ]);

  const holders = breakdown[0];

  if (!holders) {
    return {
      summary: `**${stock.name}** has no insider activity data available.`,
      details: [],
      verdict: 'Unknown',
      verdict_color: 'yellow',
    };
  }

  const insidersPercent = n(holders.insidersPercentHeld, 0) * 100;
  const institutionsPercent = n(holders.institutionsPercentHeld, 0) * 100;
  const publicPercent = Math.max(0, 100 - insidersPercent - institutionsPercent);
  const institutionCount = n(holders.institutionsCount, 0);

  // Calculate net buy/sell from recent transactions
  let buyTransactions = 0;
  let sellTransactions = 0;
  let netShares = 0;

  recentTransactions.forEach((txn) => {
    const shares = n(txn.shares, 0);
    const text = (txn.transactionText || '').toLowerCase();

    // Identify buy vs sell based on transaction text
    if (text.includes('purchase') || text.includes('bought') || text.includes('acquired')) {
      buyTransactions++;
      netShares += shares;
    } else if (text.includes('sale') || text.includes('sold') || text.includes('disposed')) {
      sellTransactions++;
      netShares -= shares;
    }
  });

  // Use net share purchase activity if available
  if (holders.netBuyCount !== null || holders.netSellCount !== null) {
    buyTransactions = n(holders.netBuyCount, buyTransactions);
    sellTransactions = n(holders.netSellCount, sellTransactions);
    netShares = n(holders.netShares, netShares);
  }

  const totalTransactions = buyTransactions + sellTransactions;
  const buyRatio = totalTransactions > 0 ? (buyTransactions / totalTransactions) * 100 : 0;

  // Determine verdict
  let verdict = 'Neutral';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let signal = 'neutral insider activity';

  if (buyRatio > 65 && netShares > 0) {
    verdict = 'Bullish';
    verdict_color = 'green';
    signal = '**positive insider signals**';
  } else if (buyRatio < 35 && netShares < 0) {
    verdict = 'Bearish';
    verdict_color = 'red';
    signal = 'concerning insider selling';
  }

  const summary = `**${stock.name}** shows ${signal}. Insiders hold **${formatNumber(insidersPercent, 1)}%** of shares, while institutions control **${formatNumber(institutionsPercent, 1)}%** across **${institutionCount}** holders. ${
    totalTransactions > 0
      ? `Recent activity shows **${buyTransactions} buys** vs **${sellTransactions} sells**${
          netShares > 0
            ? ` with a net accumulation of **${(netShares / 1000).toFixed(0)}K shares**`
            : netShares < 0
            ? ` with a net reduction of **${(Math.abs(netShares) / 1000).toFixed(0)}K shares**`
            : ''
        }.`
      : 'No recent transaction activity on record.'
  }`;

  const details = [
    {
      label: 'Insider Ownership',
      value: `${formatNumber(insidersPercent, 2)}%`,
      status: (insidersPercent > 10 ? 'safe' : insidersPercent > 5 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Institutional Ownership',
      value: `${formatNumber(institutionsPercent, 2)}%`,
      status: (institutionsPercent > 50 ? 'safe' : institutionsPercent > 30 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Public Ownership',
      value: `${formatNumber(publicPercent, 2)}%`,
      status: 'neutral' as 'neutral',
    },
    {
      label: 'Institution Count',
      value: institutionCount.toString(),
      status: (institutionCount > 100 ? 'safe' : institutionCount > 50 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Recent Buy/Sell Ratio',
      value: totalTransactions > 0 ? `${buyTransactions}/${sellTransactions}` : 'N/A',
      status: (buyRatio > 65 ? 'safe' : buyRatio < 35 ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

/**
 * US-090: Top Holders (Follow-up)
 * Returns institutional ownership %, insider ownership %, top holders concentration, institution count
 */
export async function respondTopHolders(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  // Parallel queries for performance
  const [breakdown, topInstitutions] = await Promise.all([
    db.select().from(majorHoldersBreakdown).where(eq(majorHoldersBreakdown.stockId, stock.id)).limit(1),
    db.select().from(institutionalHolders)
      .where(eq(institutionalHolders.stockId, stock.id))
      .orderBy(desc(institutionalHolders.position))
      .limit(5),
  ]);

  const holders = breakdown[0];

  if (!holders) {
    return {
      summary: `**${stock.name}** has no ownership data available.`,
      details: [],
      verdict: 'Unknown',
      verdict_color: 'yellow',
    };
  }

  const insidersPercent = n(holders.insidersPercentHeld, 0) * 100;
  const institutionsPercent = n(holders.institutionsPercentHeld, 0) * 100;
  const institutionsFloatPercent = n(holders.institutionsFloatPercentHeld, 0) * 100;
  const institutionCount = n(holders.institutionsCount, 0);

  // Calculate top 5 concentration
  let top5Concentration = 0;
  topInstitutions.forEach((inst) => {
    top5Concentration += n(inst.pctHeld, 0) * 100;
  });

  // Determine verdict
  let verdict = 'Moderate';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let concentration = 'moderate';

  if (institutionsPercent > 70 && institutionCount > 200) {
    verdict = 'Strong';
    verdict_color = 'green';
    concentration = '**strong institutional backing**';
  } else if (institutionsPercent < 30 || institutionCount < 50) {
    verdict = 'Light';
    verdict_color = 'red';
    concentration = 'limited institutional interest';
  }

  const topHolderNames = topInstitutions.slice(0, 3).map((h) => h.organization).join(', ');

  const summary = `**${stock.name}** has ${concentration}. Institutions hold **${formatNumber(institutionsPercent, 1)}%** of shares (representing **${formatNumber(institutionsFloatPercent, 1)}%** of the float) across **${institutionCount}** holders. ${
    topInstitutions.length > 0
      ? `The top 5 holders control **${formatNumber(top5Concentration, 1)}%** of shares, led by **${topHolderNames}**.`
      : 'No detailed holder information available.'
  } ${
    insidersPercent > 10
      ? `Insiders maintain a significant **${formatNumber(insidersPercent, 1)}%** stake.`
      : `Insider ownership is minimal at **${formatNumber(insidersPercent, 1)}%**.`
  }`;

  const details = [
    {
      label: 'Institutional Ownership',
      value: `${formatNumber(institutionsPercent, 2)}%`,
      status: (institutionsPercent > 60 ? 'safe' : institutionsPercent > 40 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Insider Ownership',
      value: `${formatNumber(insidersPercent, 2)}%`,
      status: (insidersPercent > 10 ? 'safe' : insidersPercent > 5 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Institution Count',
      value: institutionCount.toString(),
      status: (institutionCount > 200 ? 'safe' : institutionCount > 100 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Top 5 Concentration',
      value: `${formatNumber(top5Concentration, 2)}%`,
      status: (top5Concentration > 40 ? 'warning' : top5Concentration > 20 ? 'neutral' : 'safe') as 'safe' | 'neutral' | 'warning',
    },
    {
      label: 'Float Held by Institutions',
      value: `${formatNumber(institutionsFloatPercent, 2)}%`,
      status: (institutionsFloatPercent > 80 ? 'safe' : institutionsFloatPercent > 50 ? 'neutral' : 'warning') as 'safe' | 'neutral' | 'warning',
    },
  ];

  return { summary, details, verdict, verdict_color };
}

/**
 * US-090: Smart Money (Follow-up)
 * Returns smart money signal (accumulating/neutral/distributing), institutional change %, insider transaction pattern analysis
 */
export async function respondSmartMoney(ticker: string): Promise<AiAgentResponseData> {
  if (!db) throw new InternalError('Database not available');

  const stock = await getStockByTicker(ticker);

  // Parallel queries for performance
  const [breakdown, recentInstitutional, recentInsider] = await Promise.all([
    db.select().from(majorHoldersBreakdown).where(eq(majorHoldersBreakdown.stockId, stock.id)).limit(1),
    db.select().from(institutionalHolders)
      .where(eq(institutionalHolders.stockId, stock.id))
      .orderBy(desc(institutionalHolders.reportDate))
      .limit(20),
    db.select().from(insiderTransactions)
      .where(eq(insiderTransactions.stockId, stock.id))
      .orderBy(desc(insiderTransactions.transactionDate))
      .limit(15),
  ]);

  const holders = breakdown[0];

  if (!holders) {
    return {
      summary: `**${stock.name}** has no smart money data available.`,
      details: [],
      verdict: 'Unknown',
      verdict_color: 'yellow',
    };
  }

  // Calculate institutional change trend
  let increasingCount = 0;
  let decreasingCount = 0;

  recentInstitutional.forEach((inst) => {
    const pctChange = n(inst.pctChange, 0);
    if (pctChange > 0) increasingCount++;
    else if (pctChange < 0) decreasingCount++;
  });

  const instChangeRatio = (increasingCount + decreasingCount) > 0
    ? (increasingCount / (increasingCount + decreasingCount)) * 100
    : 50;

  // Calculate insider buy/sell pattern
  let insiderBuys = 0;
  let insiderSells = 0;

  recentInsider.forEach((txn) => {
    const text = (txn.transactionText || '').toLowerCase();
    if (text.includes('purchase') || text.includes('bought') || text.includes('acquired')) {
      insiderBuys++;
    } else if (text.includes('sale') || text.includes('sold') || text.includes('disposed')) {
      insiderSells++;
    }
  });

  const insiderBuyRatio = (insiderBuys + insiderSells) > 0
    ? (insiderBuys / (insiderBuys + insiderSells)) * 100
    : 50;

  // Combined smart money signal
  const smartMoneyScore = (instChangeRatio * 0.6 + insiderBuyRatio * 0.4);

  // Determine verdict
  let verdict = 'Neutral';
  let verdict_color: 'green' | 'yellow' | 'red' = 'yellow';
  let signal = 'neutral';
  let description = 'mixed signals';

  if (smartMoneyScore > 65) {
    verdict = 'Accumulating';
    verdict_color = 'green';
    signal = '**accumulating**';
    description = 'Smart money is flowing in';
  } else if (smartMoneyScore < 35) {
    verdict = 'Distributing';
    verdict_color = 'red';
    signal = 'distributing';
    description = 'Insiders are heading for the exits';
  } else {
    description = 'Smart money activity is mixed';
  }

  const netBuyCount = n(holders.netBuyCount, 0);
  const netSellCount = n(holders.netSellCount, 0);
  const netShares = n(holders.netShares, 0);

  const summary = `${description} for **${stock.name}**. Institutional activity shows **${increasingCount} positions increasing** vs **${decreasingCount} decreasing** (trend: ${signal}). Insider transactions reveal **${insiderBuys} buys** vs **${insiderSells} sells** in recent activity. ${
    netShares > 0
      ? `Net insider purchases total **${(netShares / 1000).toFixed(0)}K shares** across **${netBuyCount}** transactions.`
      : netShares < 0
      ? `Net insider sales total **${(Math.abs(netShares) / 1000).toFixed(0)}K shares** across **${netSellCount}** transactions.`
      : 'Net insider activity is balanced.'
  } Overall smart money signal: **${signal}**.`;

  const details = [
    {
      label: 'Smart Money Signal',
      value: signal.replace(/\*/g, '').charAt(0).toUpperCase() + signal.replace(/\*/g, '').slice(1),
      status: (smartMoneyScore > 65 ? 'safe' : smartMoneyScore < 35 ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
    {
      label: 'Institutional Trend',
      value: `${increasingCount} up / ${decreasingCount} down`,
      status: (increasingCount > decreasingCount ? 'safe' : increasingCount < decreasingCount ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
    {
      label: 'Insider Pattern',
      value: `${insiderBuys} buys / ${insiderSells} sells`,
      status: (insiderBuys > insiderSells ? 'safe' : insiderBuys < insiderSells ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
    {
      label: 'Net Insider Shares',
      value: netShares > 0
        ? `+${(netShares / 1000).toFixed(0)}K`
        : netShares < 0
        ? `${(netShares / 1000).toFixed(0)}K`
        : '0',
      status: (netShares > 0 ? 'safe' : netShares < 0 ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
    {
      label: 'Smart Money Score',
      value: `${formatNumber(smartMoneyScore, 0)}/100`,
      status: (smartMoneyScore > 65 ? 'safe' : smartMoneyScore < 35 ? 'danger' : 'neutral') as 'safe' | 'danger' | 'neutral',
    },
  ];

  return { summary, details, verdict, verdict_color };
}
