import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { executives, filings, stocks } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';

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
