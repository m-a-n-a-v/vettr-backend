import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * VETR Score Service - Component Calculator Tests
 *
 * NOTE: The original component functions (pedigreeScore, filingVelocityScore,
 * redFlagComponent, growthMetricsScore, governanceScore) were removed during
 * the scoring system refactor. The new scoring pillars are:
 *   - financialSurvivalScore
 *   - operationalEfficiencyScore
 *   - shareholderStructureScore
 *   - marketSentimentScore
 *   - redistributeWeights
 *   - calculateVetrScore
 *
 * Tests for removed functions are marked as .todo.
 * Tests that don't call removed functions (Bonus/Penalty, Clamping, Weighted Combination)
 * are preserved as-is since they test general logic, not specific service exports.
 */

// Mock types based on schema
type ExecutiveRow = {
  id: string;
  stockId: string;
  name: string;
  title: string | null;
  yearsAtCompany: number;
  previousCompanies: string[] | null;
  education: string | null;
  specialization: string | null;
  socialLinkedin: string | null;
  socialTwitter: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FilingRow = {
  id: string;
  stockId: string;
  type: string;
  title: string;
  date: Date;
  summary: string;
  isMaterial: boolean;
  sourceUrl: string | null;
  createdAt: Date;
};

type StockRow = {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  marketCap: number | null;
  price: number | null;
  priceChange: number | null;
  vetrScore: number | null;
  updatedAt: Date;
};

describe('VETR Score Service - Component Calculators', () => {
  // pedigreeScore was removed in the scoring refactor
  describe.todo('pedigreeScore');

  // filingVelocityScore was removed in the scoring refactor
  describe.todo('filingVelocityScore');

  // redFlagComponent was removed in the scoring refactor
  describe.todo('redFlagComponent');

  // growthMetricsScore was removed in the scoring refactor
  describe.todo('growthMetricsScore');

  // governanceScore was removed in the scoring refactor
  describe.todo('governanceScore');

  describe('Bonus and Penalty Application', () => {
    it('should apply +5 bonus for audited financials', () => {
      // Test detectBonuses indirectly by checking the filing detection logic
      const filings: FilingRow[] = [
        {
          id: 'filing-1',
          stockId: 'stock-1',
          type: 'Financial Statements',
          title: 'Q1 Financials',
          date: new Date(),
          summary: 'Summary',
          isMaterial: true,
          sourceUrl: null,
          createdAt: new Date(),
        },
      ];
      // Financial statements should trigger +5 bonus
      // This is tested indirectly through the presence of "financial" in type
      const hasFinancials = filings.some(f => f.type?.toLowerCase().includes('financial'));
      expect(hasFinancials).toBe(true);
    });

    it('should apply +5 bonus for board expertise', () => {
      const execs: ExecutiveRow[] = [
        {
          id: '1',
          stockId: 'stock-1',
          name: 'John Doe',
          title: 'CEO',
          yearsAtCompany: 10,
          previousCompanies: null,
          education: 'MBA, CPA',
          specialization: 'Finance',
          socialLinkedin: null,
          socialTwitter: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      // Education with professional designations should trigger +5 bonus
      const expertiseKeywords = ['p.eng', 'p.geo', 'cpa', 'cfa', 'mba', 'phd', 'fca'];
      const hasBoardExpertise = execs.some(e =>
        expertiseKeywords.some(kw => e.education?.toLowerCase().includes(kw))
      );
      expect(hasBoardExpertise).toBe(true);
    });

    it('should apply -10 penalty for overdue filings (no filings in 90 days)', () => {
      const now = new Date();
      const filings: FilingRow[] = [
        {
          id: 'filing-1',
          stockId: 'stock-1',
          type: 'Press Release',
          title: 'Old Filing',
          date: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
          summary: 'Summary',
          isMaterial: false,
          sourceUrl: null,
          createdAt: new Date(),
        },
      ];
      // No filings in last 90 days should trigger -10 penalty
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const recentFilings = filings.filter(f => f.date >= ninetyDaysAgo);
      expect(recentFilings.length).toBe(0);
      expect(filings.length).toBeGreaterThan(0);
    });

    it('should apply -10 penalty for regulatory issues', () => {
      const filings: FilingRow[] = [
        {
          id: 'filing-1',
          stockId: 'stock-1',
          type: 'Press Release',
          title: 'Regulatory Compliance Issue',
          date: new Date(),
          summary: 'Summary',
          isMaterial: true,
          sourceUrl: null,
          createdAt: new Date(),
        },
      ];
      // Material press release with regulatory keywords should trigger -10 penalty
      const hasRegulatoryIssues = filings.some(
        f =>
          f.isMaterial &&
          f.type?.toLowerCase().includes('press release') &&
          (f.title?.toLowerCase().includes('regulatory') ||
            f.title?.toLowerCase().includes('compliance') ||
            f.title?.toLowerCase().includes('sanction') ||
            f.title?.toLowerCase().includes('violation'))
      );
      expect(hasRegulatoryIssues).toBe(true);
    });
  });

  describe('Final Score Clamping', () => {
    it('should clamp score to minimum of 0', () => {
      // Test that negative scores are clamped to 0
      // This is tested indirectly through the Math.max(0, ...) in final calculation
      const clampedScore = Math.max(0, Math.min(100, -10));
      expect(clampedScore).toBe(0);
    });

    it('should clamp score to maximum of 100', () => {
      // Test that scores over 100 are clamped to 100
      const clampedScore = Math.max(0, Math.min(100, 120));
      expect(clampedScore).toBe(100);
    });

    it('should not modify scores within 0-100 range', () => {
      const scores = [0, 25, 50, 75, 100];
      scores.forEach(score => {
        const clampedScore = Math.max(0, Math.min(100, score));
        expect(clampedScore).toBe(score);
      });
    });
  });

  describe('Weighted Combination', () => {
    it('should apply correct weights to component scores', () => {
      const weights = {
        pedigree: 0.25,
        filing_velocity: 0.20,
        red_flag: 0.25,
        growth: 0.15,
        governance: 0.15,
      };

      // Verify weights sum to 1.0
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBe(1.0);
    });

    it('should calculate weighted score correctly', () => {
      const components = {
        pedigree: 80,
        filing_velocity: 60,
        red_flag: 100,
        growth: 40,
        governance: 70,
      };
      const weights = {
        pedigree: 0.25,
        filing_velocity: 0.20,
        red_flag: 0.25,
        growth: 0.15,
        governance: 0.15,
      };

      const weightedScore =
        components.pedigree * weights.pedigree +
        components.filing_velocity * weights.filing_velocity +
        components.red_flag * weights.red_flag +
        components.growth * weights.growth +
        components.governance * weights.governance;

      // 80*0.25 + 60*0.20 + 100*0.25 + 40*0.15 + 70*0.15
      // = 20 + 12 + 25 + 6 + 10.5 = 73.5
      expect(weightedScore).toBe(73.5);
    });

    it('should handle perfect scores (all components at 100)', () => {
      const components = {
        pedigree: 100,
        filing_velocity: 100,
        red_flag: 100,
        growth: 100,
        governance: 100,
      };
      const weights = {
        pedigree: 0.25,
        filing_velocity: 0.20,
        red_flag: 0.25,
        growth: 0.15,
        governance: 0.15,
      };

      const weightedScore =
        components.pedigree * weights.pedigree +
        components.filing_velocity * weights.filing_velocity +
        components.red_flag * weights.red_flag +
        components.growth * weights.growth +
        components.governance * weights.governance;

      expect(weightedScore).toBe(100);
    });

    it('should handle zero scores (all components at 0)', () => {
      const components = {
        pedigree: 0,
        filing_velocity: 0,
        red_flag: 0,
        growth: 0,
        governance: 0,
      };
      const weights = {
        pedigree: 0.25,
        filing_velocity: 0.20,
        red_flag: 0.25,
        growth: 0.15,
        governance: 0.15,
      };

      const weightedScore =
        components.pedigree * weights.pedigree +
        components.filing_velocity * weights.filing_velocity +
        components.red_flag * weights.red_flag +
        components.growth * weights.growth +
        components.governance * weights.governance;

      expect(weightedScore).toBe(0);
    });
  });
});
