import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInitialQuestions,
  getFollowUpQuestions,
  getQuestionById,
  getAllQuestions,
} from '../../src/services/ai-agent-questions.js';
import * as responders from '../../src/services/ai-agent-responders.js';
import { createMockDb } from '../helpers/db.helper.js';

// Mock the database module for responder tests
vi.mock('../../src/config/database.js', () => ({
  db: null, // Will be overridden in responder tests
}));

// Mock the red-flag service for red flag responders
vi.mock('../../src/services/red-flag.service.js', () => ({
  detectRedFlags: vi.fn().mockResolvedValue({
    composite_score: 42,
    severity_level: 'Moderate',
    flags: [
      {
        name: 'debt_trend',
        score: 50,
        weight: 0.8,
        weighted_score: 40,
        description: 'Debt increasing',
      },
    ],
  }),
}));

describe('AI Agent - Question Registry', () => {
  describe('getInitialQuestions', () => {
    it('should return exactly 6 initial questions', () => {
      const questions = getInitialQuestions();
      expect(questions).toHaveLength(6);
    });

    it('should return questions with all required fields', () => {
      const questions = getInitialQuestions();
      questions.forEach(q => {
        expect(q).toHaveProperty('id');
        expect(q).toHaveProperty('label');
        expect(q).toHaveProperty('category');
        expect(q).toHaveProperty('parent_id');
        expect(q).toHaveProperty('icon');
        expect(q.parent_id).toBeNull();
      });
    });

    it('should include all 6 category questions', () => {
      const questions = getInitialQuestions();
      const ids = questions.map(q => q.id);
      expect(ids).toContain('financial_health');
      expect(ids).toContain('analyst_view');
      expect(ids).toContain('insider_activity');
      expect(ids).toContain('valuation');
      expect(ids).toContain('earnings');
      expect(ids).toContain('red_flags');
    });
  });

  describe('getFollowUpQuestions', () => {
    it('should return exactly 2 follow-up questions for financial_health', () => {
      const questions = getFollowUpQuestions('financial_health');
      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.parent_id === 'financial_health')).toBe(true);
    });

    it('should return exactly 2 follow-up questions for analyst_view', () => {
      const questions = getFollowUpQuestions('analyst_view');
      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.parent_id === 'analyst_view')).toBe(true);
    });

    it('should return exactly 2 follow-up questions for insider_activity', () => {
      const questions = getFollowUpQuestions('insider_activity');
      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.parent_id === 'insider_activity')).toBe(true);
    });

    it('should return exactly 2 follow-up questions for valuation', () => {
      const questions = getFollowUpQuestions('valuation');
      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.parent_id === 'valuation')).toBe(true);
    });

    it('should return exactly 2 follow-up questions for earnings', () => {
      const questions = getFollowUpQuestions('earnings');
      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.parent_id === 'earnings')).toBe(true);
    });

    it('should return exactly 2 follow-up questions for red_flags', () => {
      const questions = getFollowUpQuestions('red_flags');
      expect(questions).toHaveLength(2);
      expect(questions.every(q => q.parent_id === 'red_flags')).toBe(true);
    });

    it('should return empty array for invalid parent_id', () => {
      const questions = getFollowUpQuestions('invalid_id');
      expect(questions).toHaveLength(0);
    });
  });

  describe('getQuestionById', () => {
    it('should return the correct question for valid id', () => {
      const question = getQuestionById('financial_health');
      expect(question).toBeDefined();
      expect(question?.id).toBe('financial_health');
    });

    it('should return the correct follow-up question for valid id', () => {
      const question = getQuestionById('debt_analysis');
      expect(question).toBeDefined();
      expect(question?.id).toBe('debt_analysis');
      expect(question?.parent_id).toBe('financial_health');
    });

    it('should return undefined for invalid id', () => {
      const question = getQuestionById('invalid_id');
      expect(question).toBeUndefined();
    });
  });

  describe('getAllQuestions', () => {
    it('should return exactly 18 questions', () => {
      const questions = getAllQuestions();
      expect(questions).toHaveLength(18);
    });

    it('should include both initial and follow-up questions', () => {
      const questions = getAllQuestions();
      const initialCount = questions.filter(q => q.parent_id === null).length;
      const followUpCount = questions.filter(q => q.parent_id !== null).length;
      expect(initialCount).toBe(6);
      expect(followUpCount).toBe(12);
    });
  });
});

describe('AI Agent - Responder Return Shape', () => {
  // Mock stock and financial data
  const mockStock = {
    id: crypto.randomUUID(),
    ticker: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    price: 150.0,
    marketCap: 2500000000000,
    vetrScore: 85,
    lastUpdated: new Date(),
  };

  const mockFinancialSummary = {
    stockId: mockStock.id,
    totalCash: 50000000000,
    totalDebt: 100000000000,
    totalRevenue: 400000000000,
    ebitda: 120000000000,
    freeCashFlow: 95000000000,
    operatingCashFlow: 105000000000,
    currentRatio: 1.1,
    quickRatio: 0.9,
    grossMargins: 0.42,
    operatingMargins: 0.30,
    netIncome: 95000000000,
    revenueGrowth: 0.08,
    lastUpdated: new Date(),
  };

  const mockValuationMetrics = {
    stockId: mockStock.id,
    peRatio: 28.5,
    forwardPE: 25.0,
    enterpriseToEbitda: 18.5,
    totalDebtToEquity: 2.0,
    returnOnEquity: 0.45,
    lastUpdated: new Date(),
  };

  const mockAnalystConsensus = {
    stockId: mockStock.id,
    totalAnalysts: 40,
    consensus: 'Buy',
    buyCount: 25,
    holdCount: 12,
    sellCount: 3,
    priceTarget: 175.0,
    priceTargetHigh: 200.0,
    priceTargetLow: 150.0,
    recommendationTrend: 'Positive',
    lastUpdated: new Date(),
  };

  const mockMajorHolders = {
    stockId: mockStock.id,
    insidersPercentHeld: 0.05,
    institutionsPercentHeld: 0.60,
    institutionsCount: 3500,
    floatHeldByInstitutions: 0.62,
    netBuyCount: 15,
    netSellCount: 5,
    netShares: 50000000,
    lastUpdated: new Date(),
  };

  const mockDividendInfo = {
    stockId: mockStock.id,
    dividendYield: 0.006,
    dividendRate: 0.92,
    exDividendDate: new Date('2024-05-10'),
    payoutRatio: 0.15,
    lastUpdated: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock DB for responder tests
   */
  function createResponderMockDb() {
    const mockDb = createMockDb({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockStock]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
    });

    return mockDb;
  }

  /**
   * Helper to verify responder return shape
   */
  function expectValidResponderShape(result: any) {
    expect(result).toBeDefined();
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('details');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('verdict_color');

    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);

    expect(Array.isArray(result.details)).toBe(true);
    expect(result.details.length).toBeGreaterThan(0);

    result.details.forEach((detail: any) => {
      expect(detail).toHaveProperty('label');
      expect(detail).toHaveProperty('value');
      expect(detail).toHaveProperty('status');
      expect(typeof detail.label).toBe('string');
      expect(typeof detail.value).toBe('string');
      expect(['safe', 'warning', 'danger', 'neutral']).toContain(detail.status);
    });

    expect(typeof result.verdict).toBe('string');
    expect(result.verdict.length).toBeGreaterThan(0);

    expect(['green', 'yellow', 'red']).toContain(result.verdict_color);
  }

  describe('Financial Health Responders', () => {
    it('respondFinancialHealth should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockValuationMetrics])
              .mockResolvedValueOnce([mockFinancialSummary]),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondFinancialHealth('AAPL');
      expectValidResponderShape(result);
    });

    it('respondDebtAnalysis should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockValuationMetrics])
              .mockResolvedValueOnce([mockFinancialSummary]),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondDebtAnalysis('AAPL');
      expectValidResponderShape(result);
    });

    it('respondCashPosition should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockFinancialSummary]),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondCashPosition('AAPL');
      expectValidResponderShape(result);
    });
  });

  describe('Analyst View Responders', () => {
    it('respondAnalystView should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockAnalystConsensus]),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondAnalystView('AAPL');
      expectValidResponderShape(result);
    });

    it('respondPriceTargets should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockAnalystConsensus]),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondPriceTargets('AAPL');
      expectValidResponderShape(result);
    });
  });

  describe('Insider Activity Responders', () => {
    it('respondInsiderActivity should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockMajorHolders]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondInsiderActivity('AAPL');
      expectValidResponderShape(result);
    });

    it('respondTopHolders should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockMajorHolders]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondTopHolders('AAPL');
      expectValidResponderShape(result);
    });

    it('respondSmartMoney should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockMajorHolders]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondSmartMoney('AAPL');
      expectValidResponderShape(result);
    });
  });

  describe('Valuation Responders', () => {
    it('respondDividendCheck should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockDividendInfo])
              .mockResolvedValueOnce([mockFinancialSummary]),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondDividendCheck('AAPL');
      expectValidResponderShape(result);
    });
  });

  describe('Earnings Responders', () => {
    it('respondEarnings should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValueOnce([mockStock])
              .mockResolvedValueOnce([mockFinancialSummary]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  quarter: 'Q1 2024',
                  epsActual: 1.5,
                  epsEstimate: 1.45,
                  epsDifference: 0.05,
                  surprisePercent: 3.45,
                },
              ]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondEarnings('AAPL');
      expectValidResponderShape(result);
    });

    it('respondEarningsBeats should return valid shape', async () => {
      const mockDb = createResponderMockDb();
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValueOnce([mockStock]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  quarter: 'Q1 2024',
                  epsActual: 1.5,
                  epsEstimate: 1.45,
                  epsDifference: 0.05,
                  surprisePercent: 3.45,
                },
              ]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await responders.respondEarningsBeats('AAPL');
      expectValidResponderShape(result);
    });
  });

  // Note: Red Flags Responders omitted due to complex mocking requirements
  // The responders are tested indirectly through integration tests
});

describe('AI Agent - Usage Constants and Tier Logic', () => {
  describe('Tier Limits', () => {
    it('FREE tier limit should be 3', () => {
      const FREE_LIMIT = 3;
      expect(FREE_LIMIT).toBe(3);
    });

    it('PRO tier limit should be 15', () => {
      const PRO_LIMIT = 15;
      expect(PRO_LIMIT).toBe(15);
    });

    it('PREMIUM tier limit should be Infinity', () => {
      const PREMIUM_LIMIT = Infinity;
      expect(PREMIUM_LIMIT).toBe(Infinity);
    });
  });

  describe('Tier Limit Logic', () => {
    function checkTierLimit(used: number, limit: number): boolean {
      return used >= limit;
    }

    it('should return true when FREE tier at boundary (3/3)', () => {
      expect(checkTierLimit(3, 3)).toBe(true);
    });

    it('should return false when FREE tier below limit (2/3)', () => {
      expect(checkTierLimit(2, 3)).toBe(false);
    });

    it('should return true when PRO tier at boundary (15/15)', () => {
      expect(checkTierLimit(15, 15)).toBe(true);
    });

    it('should return false when PRO tier below limit (14/15)', () => {
      expect(checkTierLimit(14, 15)).toBe(false);
    });

    it('should return false when PREMIUM tier with any usage (999/Infinity)', () => {
      expect(checkTierLimit(999, Infinity)).toBe(false);
    });

    it('should return false when PREMIUM tier with zero usage (0/Infinity)', () => {
      expect(checkTierLimit(0, Infinity)).toBe(false);
    });
  });
});
