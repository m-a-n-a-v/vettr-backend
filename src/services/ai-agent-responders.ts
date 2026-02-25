/**
 * AI Agent Response Generators
 * Pre-defined template-based responses for stock analysis questions
 */

import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  stocks,
  financialSummary,
  valuationMetrics,
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
