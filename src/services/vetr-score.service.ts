import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { executives, filings, stocks, vetrScoreHistory } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';
import * as cache from './cache.service.js';

// Types for component inputs
type ExecutiveRow = typeof executives.$inferSelect;
type FilingRow = typeof filings.$inferSelect;
type StockRow = typeof stocks.$inferSelect;

/**
 * Pedigree Score Component (weight: 25%)
 *
 * Calculates the executive team pedigree score based on three sub-components:
 * - Experience (50pts max): Based on average years of experience across the team. 20+ years average = 50pts, linearly scaled.
 * - Tenure Stability (30pts max): Based on average tenure at current company. 10+ years average = 30pts, linearly scaled.
 * - Specialization (20pts max): Based on number of unique specializations. 5+ unique specializations = 20pts, 4pts per specialization.
 *
 * @param execList - Array of executive records for a stock
 * @returns Score 0-100
 */
export function pedigreeScore(execList: ExecutiveRow[]): number {
  if (execList.length === 0) {
    return 0;
  }

  // Experience score (50pts max at 20yr avg)
  // Use yearsAtCompany + estimated previous experience from previousCompanies
  const avgExperience =
    execList.reduce((sum, exec) => {
      const previousYears = (exec.previousCompanies ?? []).length * 3; // ~3 years per previous company
      return sum + exec.yearsAtCompany + previousYears;
    }, 0) / execList.length;
  const experienceScore = Math.min(Math.round((avgExperience / 20) * 50), 50);

  // Tenure stability score (30pts max at 10yr avg)
  const avgTenure =
    execList.reduce((sum, exec) => sum + exec.yearsAtCompany, 0) / execList.length;
  const tenureStabilityScore = Math.min(Math.round((avgTenure / 10) * 30), 30);

  // Specialization score (20pts max at 5+ unique specializations)
  const uniqueSpecializations = new Set(
    execList
      .map((e) => e.specialization)
      .filter((s): s is string => s !== null && s !== undefined && s.length > 0)
  );
  const specializationScore = Math.min(uniqueSpecializations.size * 4, 20);

  return experienceScore + tenureStabilityScore + specializationScore;
}

/**
 * Filing Velocity Score Component (weight: 20%)
 *
 * Calculates the filing velocity score based on three sub-components:
 * - Regularity (40pts max): Based on filing frequency. 12+ filings in last year = 40pts (monthly), scaled linearly.
 * - Timeliness (30pts max): Based on filing recency. Most recent filing 0-7 days ago = 30pts, 30+ days = 0pts, linearly interpolated.
 * - Quality (30pts max): Based on filing content quality indicators — material filings and type diversity.
 *
 * @param filingList - Array of filing records for a stock
 * @returns Score 0-100
 */
export function filingVelocityScore(filingList: FilingRow[]): number {
  if (filingList.length === 0) {
    return 0;
  }

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Filter filings from last 12 months
  const recentFilings = filingList.filter((f) => f.date >= oneYearAgo);

  // Regularity score (40pts max at 12+ filings per year)
  const filingCount = recentFilings.length;
  const regularityScore = Math.min(Math.round((filingCount / 12) * 40), 40);

  // Timeliness score (30pts max)
  // Based on most recent filing age: 0-7 days = full, 30+ days = 0
  const sortedByDate = [...filingList].sort((a, b) => b.date.getTime() - a.date.getTime());
  const mostRecent = sortedByDate[0];
  let timelinessScore = 0;
  if (mostRecent) {
    const daysSinceLastFiling = (now.getTime() - mostRecent.date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastFiling <= 7) {
      timelinessScore = 30;
    } else if (daysSinceLastFiling >= 30) {
      timelinessScore = 0;
    } else {
      // Linear interpolation between 7 and 30 days
      timelinessScore = Math.round(30 * (1 - (daysSinceLastFiling - 7) / 23));
    }
  }

  // Quality score (30pts max)
  // Material filings (15pts): proportion of material filings
  const materialCount = recentFilings.filter((f) => f.isMaterial).length;
  const materialScore =
    recentFilings.length > 0
      ? Math.min(Math.round((materialCount / recentFilings.length) * 15), 15)
      : 0;

  // Type diversity (15pts): number of unique filing types (4+ = full score)
  const uniqueTypes = new Set(recentFilings.map((f) => f.type));
  const diversityScore = Math.min(uniqueTypes.size * 3.75, 15);
  const qualityScore = Math.round(materialScore + diversityScore);

  return regularityScore + timelinessScore + qualityScore;
}

/**
 * Red Flag Component (weight: 25%)
 *
 * Inverts the red flag composite score so that lower red flags = higher VETR score.
 * A stock with no red flags (composite = 0) gets 100 points.
 * A stock with maximum red flags (composite = 100) gets 0 points.
 *
 * @param redFlagCompositeScore - The composite red flag score (0-100)
 * @returns Score 0-100
 */
export function redFlagComponent(redFlagCompositeScore: number): number {
  const clamped = Math.max(0, Math.min(100, redFlagCompositeScore));
  return Math.round(100 - clamped);
}

/**
 * Growth Metrics Score Component (weight: 15%)
 *
 * Calculates the growth metrics score based on three sub-components:
 * - Revenue Growth (40pts max): Based on price change as a proxy for revenue growth momentum.
 *   50%+ price change = full score, linearly scaled. Negative change = 0.
 * - Capital Raised (30pts max): Based on market cap as a proxy for capital-raising ability.
 *   $100M+ market cap = full score, linearly scaled.
 * - Momentum (30pts max): Based on positive price trajectory and market cap size.
 *   Combines price change direction (15pts) and relative market cap strength (15pts).
 *
 * Note: Uses available stock data fields (price_change, market_cap) as proxies since
 * the database doesn't store explicit revenue growth or capital raised figures.
 *
 * @param stock - Stock record with market data
 * @returns Score 0-100
 */
export function growthMetricsScore(stock: StockRow): number {
  // Revenue Growth (40pts max at 50%+ price change)
  // Use price_change percentage as a proxy for revenue growth momentum
  const priceChangePct = stock.priceChange ?? 0;
  let revenueGrowthScore = 0;
  if (priceChangePct > 0) {
    revenueGrowthScore = Math.min(Math.round((priceChangePct / 50) * 40), 40);
  }

  // Capital Raised (30pts max at $100M+ market cap)
  // Use market_cap as a proxy for total capital raised
  const marketCap = stock.marketCap ?? 0;
  const capitalRaisedScore = Math.min(
    Math.round((marketCap / 100_000_000) * 30),
    30
  );

  // Momentum (30pts max)
  // Positive price change direction (15pts) + relative market cap strength (15pts)
  let momentumScore = 0;

  // Price direction component (15pts): positive change = up to 15pts
  if (priceChangePct > 0) {
    momentumScore += Math.min(Math.round((priceChangePct / 25) * 15), 15);
  }

  // Market cap strength component (15pts): $500M+ = full score
  momentumScore += Math.min(Math.round((marketCap / 500_000_000) * 15), 15);

  return revenueGrowthScore + capitalRaisedScore + momentumScore;
}

/**
 * Governance Score Component (weight: 15%)
 *
 * Calculates the governance score based on three sub-components:
 * - Board Independence (40pts max): Based on executive team size and diversity of titles.
 *   Having multiple distinct leadership roles suggests independent oversight.
 *   5+ distinct titles = full score, 8pts per unique title.
 * - Audit Committee (30pts max): Based on presence of financial oversight roles
 *   (CFO, VP Finance, Controller, etc.) and proportion of audited financial filings.
 *   Financial roles (15pts) + audited financials proportion (15pts).
 * - Disclosure Quality (30pts max): Based on filing regularity and type coverage.
 *   12+ filings in last year (15pts) + 4+ unique filing types (15pts).
 *
 * @param execList - Array of executive records for a stock
 * @param filingList - Array of filing records for a stock
 * @returns Score 0-100
 */
export function governanceScore(execList: ExecutiveRow[], filingList: FilingRow[]): number {
  if (execList.length === 0 && filingList.length === 0) {
    return 0;
  }

  // Board Independence (40pts max)
  // More distinct leadership titles suggest broader governance structure
  const uniqueTitles = new Set(
    execList
      .map((e) => e.title?.toLowerCase().trim())
      .filter((t): t is string => t !== null && t !== undefined && t.length > 0)
  );
  const boardIndependenceScore = Math.min(uniqueTitles.size * 8, 40);

  // Audit Committee (30pts max)
  // Financial oversight roles (15pts) + audited financials proportion (15pts)
  const financialRoles = [
    'cfo',
    'chief financial officer',
    'vp finance',
    'controller',
    'treasurer',
    'audit',
    'vp corporate finance',
  ];
  const hasFinancialRoles = execList.some((e) =>
    financialRoles.some((role) => e.title?.toLowerCase().includes(role))
  );
  const financialRoleScore = hasFinancialRoles ? 15 : 0;

  // Audited financials: count "Financial Statements" filings as a proxy for audited financials
  const financialStatements = filingList.filter((f) =>
    f.type?.toLowerCase().includes('financial')
  );
  const auditedProportion =
    filingList.length > 0 ? financialStatements.length / filingList.length : 0;
  const auditedScore = Math.min(Math.round(auditedProportion * 15), 15);
  const auditCommitteeScore = financialRoleScore + auditedScore;

  // Disclosure Quality (30pts max)
  // Filing regularity (15pts) + filing type coverage (15pts)
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const recentFilings = filingList.filter((f) => f.date >= oneYearAgo);

  // Regularity: 12+ filings in last year = full 15pts
  const regularityScore = Math.min(Math.round((recentFilings.length / 12) * 15), 15);

  // Type coverage: 4+ unique filing types = full 15pts
  const uniqueFilingTypes = new Set(recentFilings.map((f) => f.type));
  const typeCoverageScore = Math.min(
    Math.round((uniqueFilingTypes.size / 4) * 15),
    15
  );
  const disclosureQualityScore = regularityScore + typeCoverageScore;

  return boardIndependenceScore + auditCommitteeScore + disclosureQualityScore;
}

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

// --- VETR Score Result Types ---

export interface VetrScoreResult {
  ticker: string;
  overall_score: number;
  components: {
    pedigree: number;
    filing_velocity: number;
    red_flag: number;
    growth: number;
    governance: number;
  };
  weights: {
    pedigree: number;
    filing_velocity: number;
    red_flag: number;
    growth: number;
    governance: number;
  };
  bonus_points: number;
  penalty_points: number;
  calculated_at: string;
}

// --- Bonus & Penalty Detection ---

/**
 * Detect bonuses for a stock based on filings and executives.
 * +5 for audited financials (has Financial Statements filings)
 * +5 for board expertise (executives with relevant education/certifications)
 */
function detectBonuses(execList: ExecutiveRow[], filingList: FilingRow[]): number {
  let bonus = 0;

  // +5 if the stock has audited financial statement filings
  const hasAuditedFinancials = filingList.some(
    (f) => f.type?.toLowerCase().includes('financial')
  );
  if (hasAuditedFinancials) {
    bonus += 5;
  }

  // +5 if executives have strong board expertise (professional designations)
  const expertiseKeywords = ['p.eng', 'p.geo', 'cpa', 'cfa', 'mba', 'phd', 'fca'];
  const hasBoardExpertise = execList.some((e) =>
    expertiseKeywords.some((kw) => e.education?.toLowerCase().includes(kw))
  );
  if (hasBoardExpertise) {
    bonus += 5;
  }

  return bonus;
}

/**
 * Detect penalties for a stock based on filings.
 * -10 for overdue filings (no filings in last 90 days)
 * -10 for regulatory issues (placeholder — could check for specific filing types or flags)
 */
function detectPenalties(filingList: FilingRow[]): number {
  let penalty = 0;

  // -10 for overdue filings (no filings in last 90 days)
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recentFilings = filingList.filter((f) => f.date >= ninetyDaysAgo);
  if (recentFilings.length === 0 && filingList.length > 0) {
    penalty += 10;
  }

  // -10 for regulatory issues (check for material press releases that might indicate issues)
  const hasRegulatoryIssues = filingList.some(
    (f) =>
      f.isMaterial &&
      f.type?.toLowerCase().includes('press release') &&
      (f.title?.toLowerCase().includes('regulatory') ||
        f.title?.toLowerCase().includes('compliance') ||
        f.title?.toLowerCase().includes('sanction') ||
        f.title?.toLowerCase().includes('violation'))
  );
  if (hasRegulatoryIssues) {
    penalty += 10;
  }

  return penalty;
}

// --- Full VETR Score Calculation ---

const CACHE_KEY_PREFIX = 'vetr_score:';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const WEIGHTS = {
  pedigree: 0.25,
  filing_velocity: 0.20,
  red_flag: 0.25,
  growth: 0.15,
  governance: 0.15,
} as const;

/**
 * Calculate the full VETR Score for a stock ticker.
 *
 * Combines 5 component scores with weights:
 * - Pedigree (25%): Executive team quality
 * - Filing Velocity (20%): Filing frequency and timeliness
 * - Red Flag (25%): Inverted red flag composite (lower flags = higher score)
 * - Growth (15%): Revenue growth and capital metrics
 * - Governance (15%): Board independence and disclosure quality
 *
 * Applies bonuses (+5 audited financials, +5 board expertise) and
 * penalties (-10 overdue filings, -10 regulatory issues).
 *
 * Clamps final score to 0-100.
 * Caches result in Redis with 24h TTL.
 * Saves result to vetr_score_history table.
 *
 * @param ticker - Stock ticker symbol
 * @returns VetrScoreResult with overall score, components, bonuses, and penalties
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

  // Fetch executives and filings in parallel
  const [execList, filingList] = await Promise.all([
    getExecutivesForTicker(upperTicker),
    getFilingsForTicker(upperTicker),
  ]);

  // Calculate each component score (0-100)
  const pedigree = pedigreeScore(execList);
  const filingVelocity = filingVelocityScore(filingList);
  // Red flag composite score is 0 for now (will be provided by red-flag.service.ts in US-055+)
  const redFlagComposite = 0;
  const redFlag = redFlagComponent(redFlagComposite);
  const growth = growthMetricsScore(stock);
  const governance = governanceScore(execList, filingList);

  // Weighted combination
  const weightedScore =
    pedigree * WEIGHTS.pedigree +
    filingVelocity * WEIGHTS.filing_velocity +
    redFlag * WEIGHTS.red_flag +
    growth * WEIGHTS.growth +
    governance * WEIGHTS.governance;

  // Bonuses and penalties
  const bonusPoints = detectBonuses(execList, filingList);
  const penaltyPoints = detectPenalties(filingList);

  // Final score with bonuses, penalties, and clamping
  const overallScore = Math.max(0, Math.min(100, Math.round(weightedScore + bonusPoints - penaltyPoints)));

  const calculatedAt = new Date().toISOString();

  const result: VetrScoreResult = {
    ticker: upperTicker,
    overall_score: overallScore,
    components: {
      pedigree,
      filing_velocity: filingVelocity,
      red_flag: redFlag,
      growth,
      governance,
    },
    weights: {
      pedigree: WEIGHTS.pedigree,
      filing_velocity: WEIGHTS.filing_velocity,
      red_flag: WEIGHTS.red_flag,
      growth: WEIGHTS.growth,
      governance: WEIGHTS.governance,
    },
    bonus_points: bonusPoints,
    penalty_points: penaltyPoints,
    calculated_at: calculatedAt,
  };

  // Cache result in Redis with 24h TTL
  await cache.set(cacheKey, result, CACHE_TTL_SECONDS);

  // Save to vetr_score_history table
  await saveScoreToHistory(upperTicker, result);

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
    // TODO: VS2-009 will update this to use new 4-pillar structure
    await db.insert(vetrScoreHistory).values({
      stockTicker: ticker,
      overallScore: result.overall_score,
      // Temporary mapping from old to new schema (will be replaced in VS2-009)
      financialSurvivalScore: 0,
      operationalEfficiencyScore: 0,
      shareholderStructureScore: 0,
      marketSentimentScore: 0,
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
