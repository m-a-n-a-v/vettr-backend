import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { executives, filings, stocks, vetrScoreHistory, financialData } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';
import * as cache from './cache.service.js';

// Types for component inputs
type ExecutiveRow = typeof executives.$inferSelect;
type FilingRow = typeof filings.$inferSelect;
type StockRow = typeof stocks.$inferSelect;
type FinancialDataRow = typeof financialData.$inferSelect;

// --- OLD 5-PILLAR FUNCTIONS REMOVED ---
// The following functions have been removed as part of the VETR Score V2 migration:
// - pedigreeScore() → replaced by shareholderStructureScore() with new PG formula
// - filingVelocityScore() → filing data now used in marketSentimentScore()
// - redFlagComponent() → removed (no longer part of core score)
// - growthMetricsScore() → removed (growth now captured in operational efficiency)
// - governanceScore() → removed (governance now captured in shareholder structure)

/**
 * Get a stock record by ticker from the database.
 * Helper used by the VETR Score calculation pipeline.
 */
export async function getStockByTicker(ticker: string): Promise<StockRow | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const result = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get executives for a stock ticker from the database.
 * Helper used by the VETR Score calculation pipeline.
 */
export async function getExecutivesForTicker(ticker: string): Promise<ExecutiveRow[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const stock = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  if (stock.length === 0) {
    return [];
  }

  return db
    .select()
    .from(executives)
    .where(eq(executives.stockId, stock[0].id))
    .orderBy(desc(executives.yearsAtCompany));
}

/**
 * Get filings for a stock ticker from the database.
 * Helper used by the VETR Score calculation pipeline.
 */
export async function getFilingsForTicker(ticker: string): Promise<FilingRow[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const stock = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  if (stock.length === 0) {
    return [];
  }

  return db
    .select()
    .from(filings)
    .where(eq(filings.stockId, stock[0].id))
    .orderBy(desc(filings.date));
}

/**
 * Get financial data for a stock ticker from the database.
 * Helper used by the VETR Score V2 calculation pipeline.
 */
export async function getFinancialDataForTicker(ticker: string): Promise<FinancialDataRow | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const stock = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  if (stock.length === 0) {
    return null;
  }

  const result = await db
    .select()
    .from(financialData)
    .where(eq(financialData.stockId, stock[0].id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// --- NEW 4-PILLAR VETR SCORE V2 CALCULATORS ---

/**
 * Financial Survival Pillar (P1) - Base Weight: 35%
 *
 * Calculates the Financial Survival score based on two sub-metrics:
 * - Cash Runway (60%): Months of cash runway normalized to 18 months = 100
 * - Solvency (40%): Debt-to-assets ratio inverted (lower debt = higher score)
 *
 * Edge cases:
 * - If monthly_burn <= 0 (profitable) → Cash Runway = 100
 * - If cash === 0 → Cash Runway = 0
 * - If total_assets === 0 → Solvency = 0
 * - If total_debt === 0 → Solvency = 100
 * - If ALL inputs are null → return null (pillar skipped for weight redistribution)
 *
 * @param financialData - Financial data with cash, monthly_burn, total_debt, total_assets
 * @returns { score, cashRunway, solvency } or null if all inputs are null
 */
export function financialSurvivalScore(financialData: {
  cash: number | null;
  monthly_burn: number | null;
  total_debt: number | null;
  total_assets: number | null;
}): { score: number; cashRunway: number; solvency: number } | null {
  const { cash, monthly_burn, total_debt, total_assets } = financialData;

  // Check if all inputs are null → return null (pillar skipped)
  if (
    cash === null &&
    monthly_burn === null &&
    total_debt === null &&
    total_assets === null
  ) {
    return null;
  }

  // --- Cash Runway Sub-Metric (60%) ---
  let cashRunwayScore: number | null = null;

  if (cash !== null && monthly_burn !== null) {
    if (monthly_burn <= 0) {
      // Profitable (cash generation) → full score
      cashRunwayScore = 100;
    } else if (cash === 0) {
      // No cash → zero score
      cashRunwayScore = 0;
    } else {
      // Calculate months of runway
      const months = cash / monthly_burn;
      // Normalize to 18 months = 100
      cashRunwayScore = Math.min(100, Math.round((months / 18) * 100));
    }
  }

  // --- Solvency Sub-Metric (40%) ---
  let solvencyScore: number | null = null;

  if (total_debt !== null && total_assets !== null) {
    if (total_assets === 0) {
      // No assets → zero score
      solvencyScore = 0;
    } else if (total_debt === 0) {
      // No debt → full score
      solvencyScore = 100;
    } else {
      // Calculate debt-to-assets ratio and invert
      const ratio = total_debt / total_assets;
      solvencyScore = Math.max(0, Math.round(100 - ratio * 200));
    }
  }

  // --- Combine Sub-Metrics ---
  // If both are null, return null
  if (cashRunwayScore === null && solvencyScore === null) {
    return null;
  }

  // If one is null, use only the available metric
  let finalScore: number;
  if (cashRunwayScore !== null && solvencyScore !== null) {
    // Both available → weighted combination
    finalScore = Math.round(cashRunwayScore * 0.6 + solvencyScore * 0.4);
  } else if (cashRunwayScore !== null) {
    // Only cash runway available
    finalScore = cashRunwayScore;
  } else {
    // Only solvency available
    finalScore = solvencyScore!;
  }

  return {
    score: finalScore,
    cashRunway: cashRunwayScore ?? 0,
    solvency: solvencyScore ?? 0,
  };
}

/**
 * Operational Efficiency Pillar (P2) - Base Weight: 25%
 *
 * Calculates the Operational Efficiency score using sector-specific formulas:
 * - Mining sector: exploration_exp / total_opex
 * - Tech sector: r_and_d_exp / total_opex
 * - General: (revenue - g_and_a_expense) / revenue
 *
 * Edge cases:
 * - If total_opex === 0 → score 50 (neutral)
 * - If ratio > 1 → score 100 (capped)
 * - If all inputs are null → return null (pillar skipped for weight redistribution)
 *
 * Normalization: score = min(100, ratio / 0.70 * 100)
 * Target ratio of 0.70 = 100 score
 *
 * @param financialData - Financial data with exploration_exp, r_and_d_exp, total_opex, g_and_a_expense, revenue
 * @param sector - Stock sector string (e.g., "Mining", "Technology", "Gold")
 * @returns { score, efficiencyRatio } or null if all inputs are null
 */
export function operationalEfficiencyScore(
  financialData: {
    exploration_exp: number | null;
    r_and_d_exp: number | null;
    total_opex: number | null;
    g_and_a_expense: number | null;
    revenue: number | null;
  },
  sector: string
): { score: number; efficiencyRatio: number } | null {
  const { exploration_exp, r_and_d_exp, total_opex, g_and_a_expense, revenue } = financialData;

  // Check if all inputs are null → return null (pillar skipped)
  if (
    exploration_exp === null &&
    r_and_d_exp === null &&
    total_opex === null &&
    g_and_a_expense === null &&
    revenue === null
  ) {
    return null;
  }

  let ratio: number | null = null;

  // Determine sector-specific formula
  const sectorLower = sector.toLowerCase();

  if (
    sectorLower.includes('mining') ||
    sectorLower.includes('gold') ||
    sectorLower.includes('resource')
  ) {
    // Mining sector: exploration_exp / total_opex
    if (exploration_exp !== null && total_opex !== null) {
      if (total_opex === 0) {
        // Edge case: no operating expenses → neutral score
        return { score: 50, efficiencyRatio: 0 };
      }
      ratio = exploration_exp / total_opex;
    }
  } else if (sectorLower.includes('tech') || sectorLower.includes('software')) {
    // Tech sector: r_and_d_exp / total_opex
    if (r_and_d_exp !== null && total_opex !== null) {
      if (total_opex === 0) {
        // Edge case: no operating expenses → neutral score
        return { score: 50, efficiencyRatio: 0 };
      }
      ratio = r_and_d_exp / total_opex;
    }
  } else {
    // General/all other sectors: (revenue - g_and_a_expense) / revenue
    if (revenue !== null && g_and_a_expense !== null) {
      if (revenue === 0) {
        // Edge case: no revenue → score 0
        return { score: 0, efficiencyRatio: 0 };
      }
      ratio = (revenue - g_and_a_expense) / revenue;
    }
  }

  // If ratio is still null, all required inputs for this sector are missing
  if (ratio === null) {
    return null;
  }

  // Edge case: ratio > 1 → capped at 100
  if (ratio > 1) {
    return { score: 100, efficiencyRatio: ratio };
  }

  // Normalize: target ratio of 0.70 = 100 score
  const score = Math.min(100, Math.round((ratio / 0.7) * 100));

  return {
    score,
    efficiencyRatio: ratio,
  };
}

/**
 * Shareholder Structure Pillar (P3) - Base Weight: 25%
 *
 * Calculates the Shareholder Structure score based on three sub-metrics:
 * - Pedigree (50%): Executive team quality using PG formula
 * - Dilution Penalty (30%): Share dilution over the past year
 * - Insider Alignment (20%): Insider ownership percentage
 *
 * Pedigree Formula: PG = E×0.40 + C×0.25 + A×0.20 + M×0.15
 * - E (Experience): Average years of experience * 5, max 100
 * - C (Career Diversity): Unique previous companies count, max 100
 * - A (Academic): Education field mapping (0-100)
 * - M (Market Alignment): Default 50 if no data
 *
 * Dilution: dilution_pct = (shares_current - shares_1yr_ago) / shares_1yr_ago
 * - If shares_1yr_ago null → score 100
 * - If dilution < 0 (buyback) → score 100
 * - score = max(0, 100 - dilution_pct * 200)
 *
 * Insider: ownership_pct = insider_shares / total_shares
 * - score = min(100, ownership_pct / 0.20 * 100)
 * - Target 20% ownership = 100 score
 * - If data null → score 50
 *
 * @param execList - Array of executive records for a stock
 * @param financialData - Financial data with shares_current, shares_1yr_ago, insider_shares, total_shares
 * @returns { score, pedigree, dilution, insider } or null if all inputs are null
 */
export function shareholderStructureScore(
  execList: ExecutiveRow[],
  financialData: {
    shares_current: number | null;
    shares_1yr_ago: number | null;
    insider_shares: number | null;
    total_shares: number | null;
  }
): { score: number; pedigree: number; dilution: number; insider: number } | null {
  const { shares_current, shares_1yr_ago, insider_shares, total_shares } = financialData;

  // Check if all inputs are null → return null (pillar skipped)
  if (
    execList.length === 0 &&
    shares_current === null &&
    shares_1yr_ago === null &&
    insider_shares === null &&
    total_shares === null
  ) {
    return null;
  }

  // --- Pedigree Sub-Metric (50%) ---
  // PG = E×0.40 + C×0.25 + A×0.20 + M×0.15
  let pedigreeScore: number;

  if (execList.length === 0) {
    // No executives → default score 50
    pedigreeScore = 50;
  } else {
    // E (Experience): Average years of experience * 5, max 100
    // Use yearsAtCompany + estimated previous experience from previousCompanies
    const avgExperience =
      execList.reduce((sum, exec) => {
        const previousYears = (exec.previousCompanies ?? []).length * 3; // ~3 years per previous company
        return sum + exec.yearsAtCompany + previousYears;
      }, 0) / execList.length;
    const experienceScore = Math.min(100, avgExperience * 5);

    // C (Career Diversity): Count unique previous companies across all executives
    const allPreviousCompanies = new Set<string>();
    execList.forEach((exec) => {
      (exec.previousCompanies ?? []).forEach((company) => {
        if (company && company.trim().length > 0) {
          allPreviousCompanies.add(company.toLowerCase().trim());
        }
      });
    });
    const careerDiversityScore = Math.min(100, allPreviousCompanies.size * 10); // 10 unique companies = 100

    // A (Academic): Education field mapping
    // Map common education keywords to scores
    const educationMapping: Record<string, number> = {
      phd: 100,
      doctorate: 100,
      mba: 90,
      'master': 85,
      'p.eng': 85,
      'p.geo': 85,
      cpa: 80,
      cfa: 80,
      fca: 80,
      'bachelor': 70,
      'b.sc': 70,
      'b.a': 70,
      'b.eng': 70,
      'b.comm': 70,
      diploma: 50,
      certificate: 40,
    };

    let academicScores: number[] = [];
    execList.forEach((exec) => {
      if (exec.education) {
        const eduLower = exec.education.toLowerCase();
        let matchedScore = 0;
        for (const [keyword, score] of Object.entries(educationMapping)) {
          if (eduLower.includes(keyword)) {
            matchedScore = Math.max(matchedScore, score);
          }
        }
        if (matchedScore > 0) {
          academicScores.push(matchedScore);
        }
      }
    });

    const academicScore =
      academicScores.length > 0
        ? academicScores.reduce((sum, s) => sum + s, 0) / academicScores.length
        : 50; // Default 50 if no education data

    // M (Market Alignment): Default 50 (no market alignment data available)
    const marketAlignmentScore = 50;

    // Calculate Pedigree PG formula
    pedigreeScore = Math.round(
      experienceScore * 0.4 +
        careerDiversityScore * 0.25 +
        academicScore * 0.2 +
        marketAlignmentScore * 0.15
    );
  }

  // --- Dilution Penalty Sub-Metric (30%) ---
  let dilutionScore: number;

  if (shares_1yr_ago === null || shares_current === null) {
    // No dilution data → default score 100 (benefit of the doubt)
    dilutionScore = 100;
  } else if (shares_1yr_ago === 0) {
    // Edge case: avoid division by zero → score 100
    dilutionScore = 100;
  } else {
    const dilutionPct = (shares_current - shares_1yr_ago) / shares_1yr_ago;

    if (dilutionPct < 0) {
      // Buyback (negative dilution) → full score
      dilutionScore = 100;
    } else {
      // Dilution penalty: score = max(0, 100 - dilution_pct * 200)
      // 50% dilution = 0 score, 0% dilution = 100 score
      dilutionScore = Math.max(0, Math.round(100 - dilutionPct * 200));
    }
  }

  // --- Insider Alignment Sub-Metric (20%) ---
  let insiderScore: number;

  if (insider_shares === null || total_shares === null || total_shares === 0) {
    // No insider ownership data → default score 50
    insiderScore = 50;
  } else {
    const ownershipPct = insider_shares / total_shares;
    // Target 20% ownership = 100 score
    insiderScore = Math.min(100, Math.round((ownershipPct / 0.2) * 100));
  }

  // --- Combine Sub-Metrics ---
  const finalScore = Math.round(
    pedigreeScore * 0.5 + dilutionScore * 0.3 + insiderScore * 0.2
  );

  return {
    score: finalScore,
    pedigree: pedigreeScore,
    dilution: dilutionScore,
    insider: insiderScore,
  };
}

/**
 * Market Sentiment Pillar (P4) - Base Weight: 15%
 *
 * Calculates the Market Sentiment score based on two sub-metrics:
 * - Liquidity Health (60%): Daily volume value (avg_vol_30d * price) normalized to $100k = 100
 * - News Velocity (40%): Recency of last press release or filing, linear decay from 100 (14d) to 0 (60d)
 *
 * Edge cases:
 * - If days < 14 → News Velocity = 100
 * - If days > 60 → News Velocity = 0
 * - If all inputs are null → return null (pillar skipped for weight redistribution)
 *
 * @param stock - Stock data with price (nullable)
 * @param financialData - Financial data with avg_vol_30d, days_since_last_pr
 * @param filingList - Array of filing records for fallback news velocity calculation
 * @returns { score, liquidity, newsVelocity } or null if all inputs are null
 */
export function marketSentimentScore(
  stock: { price: number | null },
  financialData: {
    avg_vol_30d: number | null;
    days_since_last_pr: number | null;
  },
  filingList: FilingRow[]
): { score: number; liquidity: number; newsVelocity: number } | null {
  const { avg_vol_30d, days_since_last_pr } = financialData;

  // Check if all inputs are null → return null (pillar skipped)
  if (avg_vol_30d === null && stock.price === null && days_since_last_pr === null && filingList.length === 0) {
    return null;
  }

  // --- Liquidity Health Sub-Metric (60%) ---
  let liquidityScore: number | null = null;

  if (avg_vol_30d !== null && stock.price !== null) {
    // Daily volume value = avg_vol_30d * price
    const dailyVolValue = avg_vol_30d * stock.price;
    // Normalize to $100k = 100 score
    liquidityScore = Math.min(100, Math.round((dailyVolValue / 100000) * 100));
  }

  // --- News Velocity Sub-Metric (40%) ---
  let newsVelocityScore: number | null = null;
  let daysSinceNews: number | null = null;

  // Use days_since_last_pr if available
  if (days_since_last_pr !== null) {
    daysSinceNews = days_since_last_pr;
  } else if (filingList.length > 0) {
    // Fallback: compute from most recent filing
    const sortedByDate = [...filingList].sort((a, b) => b.date.getTime() - a.date.getTime());
    const mostRecent = sortedByDate[0];
    const now = new Date();
    daysSinceNews = Math.round((now.getTime() - mostRecent.date.getTime()) / (1000 * 60 * 60 * 24));
  } else {
    // Default to 90 days if both are null
    daysSinceNews = 90;
  }

  // Calculate News Velocity score based on days since last news
  if (daysSinceNews !== null) {
    if (daysSinceNews < 14) {
      // Recent news → full score
      newsVelocityScore = 100;
    } else if (daysSinceNews > 60) {
      // Stale news → zero score
      newsVelocityScore = 0;
    } else {
      // Linear decay from 100 (14d) to 0 (60d)
      // score = 100 - ((days - 14) * 100) / 46
      newsVelocityScore = Math.max(0, Math.round(100 - ((daysSinceNews - 14) * 100) / 46));
    }
  }

  // --- Combine Sub-Metrics ---
  // If both are null, return null
  if (liquidityScore === null && newsVelocityScore === null) {
    return null;
  }

  // If one is null, use only the available metric
  let finalScore: number;
  if (liquidityScore !== null && newsVelocityScore !== null) {
    // Both available → weighted combination
    finalScore = Math.round(liquidityScore * 0.6 + newsVelocityScore * 0.4);
  } else if (liquidityScore !== null) {
    // Only liquidity available
    finalScore = liquidityScore;
  } else {
    // Only news velocity available
    finalScore = newsVelocityScore!;
  }

  return {
    score: finalScore,
    liquidity: liquidityScore ?? 0,
    newsVelocity: newsVelocityScore ?? 0,
  };
}

// --- Null Pillar Weight Redistribution ---

/**
 * Redistributes weights when a pillar returns null.
 *
 * When a pillar's inputs are ALL null, it should be skipped from the overall
 * score calculation. Remaining pillars get proportionally larger weights so
 * they still sum to 1.0.
 *
 * Base weights: P1=0.35, P2=0.25, P3=0.25, P4=0.15
 *
 * Example: If P2 (0.25) is null, totalAvailable = 0.75
 * - newP1 = 0.35 / 0.75 = 0.4667
 * - newP3 = 0.25 / 0.75 = 0.3333
 * - newP4 = 0.15 / 0.75 = 0.2000
 *
 * If all pillars are null, overall score = 0, all weights = 0
 *
 * @param pillarResults - Array of pillar results with pillar name, score (or null), and base weight
 * @returns { adjustedWeights: Record<string, number>, nullPillars: string[] }
 */
export function redistributeWeights(
  pillarResults: Array<{
    pillar: string;
    score: number | null;
    baseWeight: number;
  }>
): { adjustedWeights: Record<string, number>; nullPillars: string[] } {
  // Identify null pillars
  const nullPillars = pillarResults
    .filter((p) => p.score === null)
    .map((p) => p.pillar);

  // If all pillars are null, return zero weights
  if (nullPillars.length === pillarResults.length) {
    const adjustedWeights: Record<string, number> = {};
    pillarResults.forEach((p) => {
      adjustedWeights[p.pillar] = 0;
    });
    return { adjustedWeights, nullPillars };
  }

  // If no pillars are null, return base weights unchanged
  if (nullPillars.length === 0) {
    const adjustedWeights: Record<string, number> = {};
    pillarResults.forEach((p) => {
      adjustedWeights[p.pillar] = p.baseWeight;
    });
    return { adjustedWeights, nullPillars: [] };
  }

  // Calculate total available weight from non-null pillars
  const totalAvailable = pillarResults
    .filter((p) => p.score !== null)
    .reduce((sum, p) => sum + p.baseWeight, 0);

  // Redistribute weights proportionally
  const adjustedWeights: Record<string, number> = {};
  pillarResults.forEach((p) => {
    if (p.score === null) {
      // Null pillar gets zero weight
      adjustedWeights[p.pillar] = 0;
    } else {
      // Non-null pillar gets proportionally larger weight
      adjustedWeights[p.pillar] = p.baseWeight / totalAvailable;
    }
  });

  return { adjustedWeights, nullPillars };
}

// --- VETR Score Result Types ---

export interface VetrScoreResult {
  ticker: string;
  overall_score: number;
  components: {
    financial_survival: {
      score: number;
      weight: number;
      sub_scores: {
        cash_runway: number;
        solvency: number;
      };
    };
    operational_efficiency: {
      score: number;
      weight: number;
      sub_scores: {
        efficiency_ratio: number;
      };
    };
    shareholder_structure: {
      score: number;
      weight: number;
      sub_scores: {
        pedigree: number;
        dilution_penalty: number;
        insider_alignment: number;
      };
    };
    market_sentiment: {
      score: number;
      weight: number;
      sub_scores: {
        liquidity: number;
        news_velocity: number;
      };
    };
  };
  null_pillars: string[];
  calculated_at: string;
}

// --- OLD BONUS & PENALTY FUNCTIONS REMOVED ---
// The following functions have been removed as part of the VETR Score V2 migration:
// - detectBonuses() → bonuses are no longer applied to the score
// - detectPenalties() → penalties are no longer applied to the score

// --- Full VETR Score Calculation ---

const CACHE_KEY_PREFIX = 'vetr_score:';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// Base weights for the 4-pillar system
const BASE_WEIGHTS = {
  financial_survival: 0.35,
  operational_efficiency: 0.25,
  shareholder_structure: 0.25,
  market_sentiment: 0.15,
} as const;

/**
 * Calculate the full VETR Score V2 for a stock ticker using the 4-pillar system.
 *
 * Combines 4 pillar scores with weights:
 * - Financial Survival (35%): Cash Runway + Solvency
 * - Operational Efficiency (25%): Sector-specific operational ratio
 * - Shareholder Structure (25%): Pedigree + Dilution + Insider Alignment
 * - Market Sentiment (15%): Liquidity + News Velocity
 *
 * Handles null pillar weight redistribution: if a pillar's inputs are ALL null,
 * it's skipped and its weight is redistributed proportionally to remaining pillars.
 *
 * Clamps final score to 0-100.
 * Caches result in Redis with 24h TTL.
 * Saves result to vetr_score_history table.
 * Updates stocks.vetr_score with new overall score.
 *
 * @param ticker - Stock ticker symbol
 * @returns VetrScoreResult with overall score, components, weights, and null_pillars
 */
export async function calculateVetrScore(ticker: string): Promise<VetrScoreResult> {
  const upperTicker = ticker.toUpperCase();

  // Check cache first
  const cacheKey = `${CACHE_KEY_PREFIX}${upperTicker}`;
  const cached = await cache.get<VetrScoreResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch stock data — required for calculation
  const stock = await getStockByTicker(upperTicker);
  if (!stock) {
    throw new NotFoundError(`Stock with ticker ${upperTicker} not found`);
  }

  // Fetch financial_data, executives, and filings in parallel
  const [financialDataRow, execList, filingList] = await Promise.all([
    getFinancialDataForTicker(upperTicker),
    getExecutivesForTicker(upperTicker),
    getFilingsForTicker(upperTicker),
  ]);

  // If no financial_data row exists, create a placeholder with all nulls
  const financialInputs = financialDataRow ?? {
    cash: null,
    monthlyBurn: null,
    totalDebt: null,
    totalAssets: null,
    explorationExp: null,
    rAndDExp: null,
    totalOpex: null,
    gAndAExpense: null,
    revenue: null,
    sharesCurrent: null,
    shares1YrAgo: null,
    insiderShares: null,
    totalShares: null,
    avgVol30d: null,
    daysSinceLastPr: null,
  } as FinancialDataRow;

  // --- Calculate 4 Pillar Scores ---

  // P1: Financial Survival (35%)
  const p1Result = financialSurvivalScore({
    cash: financialInputs.cash,
    monthly_burn: financialInputs.monthlyBurn,
    total_debt: financialInputs.totalDebt,
    total_assets: financialInputs.totalAssets,
  });

  // P2: Operational Efficiency (25%)
  const p2Result = operationalEfficiencyScore(
    {
      exploration_exp: financialInputs.explorationExp,
      r_and_d_exp: financialInputs.rAndDExp,
      total_opex: financialInputs.totalOpex,
      g_and_a_expense: financialInputs.gAndAExpense,
      revenue: financialInputs.revenue,
    },
    stock.sector
  );

  // P3: Shareholder Structure (25%)
  const p3Result = shareholderStructureScore(execList, {
    shares_current: financialInputs.sharesCurrent,
    shares_1yr_ago: financialInputs.shares1YrAgo,
    insider_shares: financialInputs.insiderShares,
    total_shares: financialInputs.totalShares,
  });

  // P4: Market Sentiment (15%)
  const p4Result = marketSentimentScore(
    { price: stock.price },
    {
      avg_vol_30d: financialInputs.avgVol30d,
      days_since_last_pr: financialInputs.daysSinceLastPr,
    },
    filingList
  );

  // --- Apply Null Pillar Weight Redistribution ---
  const pillarResults = [
    { pillar: 'financial_survival', score: p1Result?.score ?? null, baseWeight: BASE_WEIGHTS.financial_survival },
    { pillar: 'operational_efficiency', score: p2Result?.score ?? null, baseWeight: BASE_WEIGHTS.operational_efficiency },
    { pillar: 'shareholder_structure', score: p3Result?.score ?? null, baseWeight: BASE_WEIGHTS.shareholder_structure },
    { pillar: 'market_sentiment', score: p4Result?.score ?? null, baseWeight: BASE_WEIGHTS.market_sentiment },
  ];

  const { adjustedWeights, nullPillars } = redistributeWeights(pillarResults);

  // --- Calculate Overall Score ---
  let overallScore = 0;
  if (p1Result !== null) {
    overallScore += p1Result.score * adjustedWeights.financial_survival;
  }
  if (p2Result !== null) {
    overallScore += p2Result.score * adjustedWeights.operational_efficiency;
  }
  if (p3Result !== null) {
    overallScore += p3Result.score * adjustedWeights.shareholder_structure;
  }
  if (p4Result !== null) {
    overallScore += p4Result.score * adjustedWeights.market_sentiment;
  }

  // Clamp to 0-100 and round
  overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));

  const calculatedAt = new Date().toISOString();

  const result: VetrScoreResult = {
    ticker: upperTicker,
    overall_score: overallScore,
    components: {
      financial_survival: {
        score: p1Result?.score ?? 0,
        weight: adjustedWeights.financial_survival,
        sub_scores: {
          cash_runway: p1Result?.cashRunway ?? 0,
          solvency: p1Result?.solvency ?? 0,
        },
      },
      operational_efficiency: {
        score: p2Result?.score ?? 0,
        weight: adjustedWeights.operational_efficiency,
        sub_scores: {
          efficiency_ratio: p2Result?.efficiencyRatio ?? 0,
        },
      },
      shareholder_structure: {
        score: p3Result?.score ?? 0,
        weight: adjustedWeights.shareholder_structure,
        sub_scores: {
          pedigree: p3Result?.pedigree ?? 0,
          dilution_penalty: p3Result?.dilution ?? 0,
          insider_alignment: p3Result?.insider ?? 0,
        },
      },
      market_sentiment: {
        score: p4Result?.score ?? 0,
        weight: adjustedWeights.market_sentiment,
        sub_scores: {
          liquidity: p4Result?.liquidity ?? 0,
          news_velocity: p4Result?.newsVelocity ?? 0,
        },
      },
    },
    null_pillars: nullPillars,
    calculated_at: calculatedAt,
  };

  // Cache result in Redis with 24h TTL
  await cache.set(cacheKey, result, CACHE_TTL_SECONDS);

  // Save to vetr_score_history table
  await saveScoreToHistory(upperTicker, result);

  // Update stocks.vetr_score with new overall score
  if (db) {
    await db
      .update(stocks)
      .set({ vetrScore: overallScore })
      .where(eq(stocks.ticker, upperTicker));
  }

  return result;
}

/**
 * Save a calculated VETR score to the vetr_score_history table.
 */
async function saveScoreToHistory(ticker: string, result: VetrScoreResult): Promise<void> {
  if (!db) {
    return;
  }

  try {
    await db.insert(vetrScoreHistory).values({
      stockTicker: ticker,
      overallScore: result.overall_score,
      // 4 Pillar Scores
      financialSurvivalScore: result.components.financial_survival.score,
      operationalEfficiencyScore: result.components.operational_efficiency.score,
      shareholderStructureScore: result.components.shareholder_structure.score,
      marketSentimentScore: result.components.market_sentiment.score,
      // Sub-scores
      cashRunwayScore: result.components.financial_survival.sub_scores.cash_runway,
      solvencyScore: result.components.financial_survival.sub_scores.solvency,
      efficiencyScore: Math.round(result.components.operational_efficiency.sub_scores.efficiency_ratio * 100), // Convert ratio to 0-100 score
      pedigreeSubScore: result.components.shareholder_structure.sub_scores.pedigree,
      dilutionPenaltyScore: result.components.shareholder_structure.sub_scores.dilution_penalty,
      insiderAlignmentScore: result.components.shareholder_structure.sub_scores.insider_alignment,
      liquidityScore: result.components.market_sentiment.sub_scores.liquidity,
      newsVelocityScore: result.components.market_sentiment.sub_scores.news_velocity,
      // Weights
      p1Weight: result.components.financial_survival.weight,
      p2Weight: result.components.operational_efficiency.weight,
      p3Weight: result.components.shareholder_structure.weight,
      p4Weight: result.components.market_sentiment.weight,
    });
  } catch (error) {
    console.error(`Failed to save VETR score history for ${ticker}:`, error);
  }
}

// --- Score History Retrieval ---

// TODO: VS2-011 will add sub-scores and weights to this interface
export interface ScoreHistoryEntry {
  id: string;
  stock_ticker: string;
  overall_score: number;
  financial_survival_score: number;
  operational_efficiency_score: number;
  shareholder_structure_score: number;
  market_sentiment_score: number;
  calculated_at: string;
}

/**
 * Retrieve VETR Score history for a stock ticker from the database.
 *
 * @param ticker - Stock ticker symbol
 * @param months - Number of months of history to retrieve (default 6)
 * @returns Array of ScoreHistoryEntry ordered by calculated_at descending
 */
// --- Score Trend Types ---

export interface ScoreTrendResult {
  ticker: string;
  current_score: number;
  trend_direction: 'improving' | 'stable' | 'declining';
  momentum: number; // -100 to +100
  change_30d: number;
  change_90d: number;
  data_points: number;
  calculated_at: string;
}

/**
 * Calculate the VETR Score trend for a stock ticker.
 *
 * Analyzes historical score data to determine:
 * - trend_direction: improving (>+5 over 90d), declining (<-5 over 90d), or stable
 * - momentum: -100 to +100 indicating velocity of change
 * - change_30d: score change over last 30 days
 * - change_90d: score change over last 90 days
 *
 * @param ticker - Stock ticker symbol
 * @returns ScoreTrendResult
 */
export async function getScoreTrend(ticker: string): Promise<ScoreTrendResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const upperTicker = ticker.toUpperCase();

  // Ensure we have a current score
  const currentScore = await calculateVetrScore(upperTicker);

  // Fetch last 90 days of history
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const history = await db
    .select()
    .from(vetrScoreHistory)
    .where(
      and(
        eq(vetrScoreHistory.stockTicker, upperTicker),
        gte(vetrScoreHistory.calculatedAt, ninetyDaysAgo)
      )
    )
    .orderBy(desc(vetrScoreHistory.calculatedAt));

  if (history.length <= 1) {
    // Not enough data points for trend analysis
    return {
      ticker: upperTicker,
      current_score: currentScore.overall_score,
      trend_direction: 'stable',
      momentum: 0,
      change_30d: 0,
      change_90d: 0,
      data_points: history.length,
      calculated_at: new Date().toISOString(),
    };
  }

  // Calculate 30-day change
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const thirtyDayEntries = history.filter((h) => h.calculatedAt <= thirtyDaysAgo);
  const oldest30d = thirtyDayEntries.length > 0 ? thirtyDayEntries[0] : null;
  const change30d = oldest30d
    ? currentScore.overall_score - oldest30d.overallScore
    : 0;

  // Calculate 90-day change
  const oldest90d = history[history.length - 1];
  const change90d = oldest90d
    ? currentScore.overall_score - oldest90d.overallScore
    : 0;

  // Determine trend direction based on 90-day change
  let trendDirection: 'improving' | 'stable' | 'declining';
  if (change90d > 5) {
    trendDirection = 'improving';
  } else if (change90d < -5) {
    trendDirection = 'declining';
  } else {
    trendDirection = 'stable';
  }

  // Calculate momentum: normalized change velocity (-100 to +100)
  // Uses weighted average of 30d and 90d changes
  const rawMomentum = change30d * 0.6 + change90d * 0.4;
  const momentum = Math.max(-100, Math.min(100, Math.round(rawMomentum * 2)));

  return {
    ticker: upperTicker,
    current_score: currentScore.overall_score,
    trend_direction: trendDirection,
    momentum,
    change_30d: change30d,
    change_90d: change90d,
    data_points: history.length,
    calculated_at: new Date().toISOString(),
  };
}

// --- Score Comparison Types ---

export interface PeerScore {
  ticker: string;
  name: string;
  overall_score: number;
}

export interface ScoreComparisonResult {
  ticker: string;
  overall_score: number;
  sector: string;
  percentile_rank: number;
  peer_count: number;
  peers: PeerScore[];
  sector_average: number;
  sector_high: number;
  sector_low: number;
  calculated_at: string;
}

/**
 * Compare a stock's VETR Score against sector peers.
 *
 * Returns:
 * - percentile_rank: 0-100 indicating where this stock ranks among peers
 * - peer scores: top peers from the same sector
 * - sector statistics: average, high, and low scores
 *
 * @param ticker - Stock ticker symbol
 * @returns ScoreComparisonResult
 */
export async function getScoreComparison(ticker: string): Promise<ScoreComparisonResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const upperTicker = ticker.toUpperCase();

  // Get the current stock and its score
  const stock = await getStockByTicker(upperTicker);
  if (!stock) {
    throw new NotFoundError(`Stock with ticker ${upperTicker} not found`);
  }

  const currentScore = await calculateVetrScore(upperTicker);

  // Get all stocks in the same sector
  const sectorPeers = await db
    .select({
      ticker: stocks.ticker,
      name: stocks.name,
      vetrScore: stocks.vetrScore,
    })
    .from(stocks)
    .where(eq(stocks.sector, stock.sector));

  // Build peer scores using vetrScore from stocks table (or calculate if needed)
  const peerScores: PeerScore[] = [];
  for (const peer of sectorPeers) {
    if (peer.ticker === upperTicker) {
      peerScores.push({
        ticker: peer.ticker,
        name: peer.name,
        overall_score: currentScore.overall_score,
      });
    } else {
      // Use the stored vetr_score from the stocks table, or 0 if not calculated
      peerScores.push({
        ticker: peer.ticker,
        name: peer.name,
        overall_score: peer.vetrScore ?? 0,
      });
    }
  }

  // Sort peers by score descending
  peerScores.sort((a, b) => b.overall_score - a.overall_score);

  // Calculate percentile rank
  const peerCount = peerScores.length;
  let percentileRank = 100;
  if (peerCount > 1) {
    const rank = peerScores.findIndex((p) => p.ticker === upperTicker) + 1;
    // Percentile = % of peers this stock scores higher than
    percentileRank = Math.round(((peerCount - rank) / (peerCount - 1)) * 100);
  }

  // Calculate sector statistics
  const scores = peerScores.map((p) => p.overall_score);
  const sectorAverage = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : 0;
  const sectorHigh = scores.length > 0 ? Math.max(...scores) : 0;
  const sectorLow = scores.length > 0 ? Math.min(...scores) : 0;

  // Return only peers (excluding the current stock), up to 10
  const peers = peerScores
    .filter((p) => p.ticker !== upperTicker)
    .slice(0, 10);

  return {
    ticker: upperTicker,
    overall_score: currentScore.overall_score,
    sector: stock.sector,
    percentile_rank: percentileRank,
    peer_count: peerCount,
    peers,
    sector_average: sectorAverage,
    sector_high: sectorHigh,
    sector_low: sectorLow,
    calculated_at: new Date().toISOString(),
  };
}

// --- Score History Retrieval ---

export async function getScoreHistory(ticker: string, months: number = 6): Promise<ScoreHistoryEntry[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const upperTicker = ticker.toUpperCase();

  // Calculate the date threshold
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const rows = await db
    .select()
    .from(vetrScoreHistory)
    .where(
      and(
        eq(vetrScoreHistory.stockTicker, upperTicker),
        gte(vetrScoreHistory.calculatedAt, since)
      )
    )
    .orderBy(desc(vetrScoreHistory.calculatedAt));

  // TODO: VS2-011 will update this to return new 4-pillar structure
  return rows.map((row) => ({
    id: row.id,
    stock_ticker: row.stockTicker,
    overall_score: row.overallScore,
    financial_survival_score: row.financialSurvivalScore,
    operational_efficiency_score: row.operationalEfficiencyScore,
    shareholder_structure_score: row.shareholderStructureScore,
    market_sentiment_score: row.marketSentimentScore,
    calculated_at: row.calculatedAt.toISOString(),
  }));
}
