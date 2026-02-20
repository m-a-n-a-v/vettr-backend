import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import * as vetrScoreService from '../../src/services/vetr-score.service.js';
import * as redFlagService from '../../src/services/red-flag.service.js';
import { createTestUser, createTestToken } from '../helpers/auth.helper.js';

/**
 * Integration tests for scoring endpoints.
 * These tests verify the VETR Score and Red Flag detection workflows.
 */

// Mock the VETR Score service
vi.mock('../../src/services/vetr-score.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/vetr-score.service.js')>(
    '../../src/services/vetr-score.service.js'
  );
  return {
    ...actual,
    calculateVetrScore: vi.fn(),
    getScoreHistory: vi.fn(),
    getScoreTrend: vi.fn(),
    getScoreComparison: vi.fn(),
  };
});

// Mock the Red Flag service
vi.mock('../../src/services/red-flag.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/red-flag.service.js')>(
    '../../src/services/red-flag.service.js'
  );
  return {
    ...actual,
    detectRedFlags: vi.fn(),
    getLatestFlagIdsForStock: vi.fn(),
    getRedFlagHistoryForStock: vi.fn(),
    getGlobalRedFlagHistory: vi.fn(),
    acknowledgeRedFlag: vi.fn(),
    acknowledgeAllForStock: vi.fn(),
    getRedFlagTrend: vi.fn(),
  };
});

describe('Scoring Endpoints Integration Tests', () => {
  let testUser: ReturnType<typeof createTestUser>;
  let authToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testUser = createTestUser({ email: 'test@example.com', tier: 'free' });
    authToken = createTestToken(testUser);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /v1/stocks/:ticker/vetr-score', () => {
    it('should return current VETR score with all component breakdowns', async () => {
      const mockScore = {
        overall_score: 82,
        pedigree_score: 75,
        filing_velocity_score: 85,
        red_flag_score: 90,
        growth_score: 70,
        governance_score: 80,
        bonus_points: 10,
        penalty_points: 5,
        calculated_at: new Date('2024-01-15T10:00:00Z'),
        components: {
          pedigree: {
            score: 75,
            experience_points: 40,
            tenure_points: 22,
            specialization_points: 13,
          },
          filing_velocity: {
            score: 85,
            regularity_points: 35,
            timeliness_points: 28,
            quality_points: 22,
          },
          red_flag: {
            score: 90,
            composite_red_flag_score: 10,
          },
          growth: {
            score: 70,
            revenue_growth_points: 30,
            capital_raised_points: 20,
            momentum_points: 20,
          },
          governance: {
            score: 80,
            board_independence_points: 35,
            audit_committee_points: 25,
            disclosure_points: 20,
          },
        },
      };

      vi.mocked(vetrScoreService.calculateVetrScore).mockResolvedValue(mockScore);

      const response = await app.request('/v1/stocks/NXE/vetr-score', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        overall_score: 82,
        pedigree_score: 75,
        filing_velocity_score: 85,
        red_flag_score: 90,
        growth_score: 70,
        governance_score: 80,
        bonus_points: 10,
        penalty_points: 5,
      });
      expect(data.data.components).toBeDefined();
      expect(data.data.components.pedigree.score).toBe(75);
      expect(vetrScoreService.calculateVetrScore).toHaveBeenCalledWith('NXE');
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/stocks/NXE/vetr-score', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should handle non-existent stock ticker', async () => {
      const { NotFoundError } = await import('../../src/utils/errors.js');
      vi.mocked(vetrScoreService.calculateVetrScore).mockRejectedValue(
        new NotFoundError('Stock not found')
      );

      const response = await app.request('/v1/stocks/INVALID/vetr-score', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/stocks/:ticker/vetr-score/history', () => {
    it('should return score history array', async () => {
      const mockHistory = [
        {
          id: crypto.randomUUID(),
          stock_ticker: 'NXE',
          overall_score: 82,
          pedigree_score: 75,
          filing_velocity_score: 85,
          red_flag_score: 90,
          growth_score: 70,
          governance_score: 80,
          bonus_points: 10,
          penalty_points: 5,
          calculated_at: new Date('2024-01-15T10:00:00Z').toISOString(),
        },
        {
          id: crypto.randomUUID(),
          stock_ticker: 'NXE',
          overall_score: 80,
          pedigree_score: 73,
          filing_velocity_score: 83,
          red_flag_score: 88,
          growth_score: 68,
          governance_score: 78,
          bonus_points: 10,
          penalty_points: 5,
          calculated_at: new Date('2024-01-01T10:00:00Z').toISOString(),
        },
      ];

      vi.mocked(vetrScoreService.getScoreHistory).mockResolvedValue(mockHistory);

      const response = await app.request('/v1/stocks/NXE/vetr-score/history?months=6', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0]).toMatchObject({
        stock_ticker: 'NXE',
        overall_score: 82,
        pedigree_score: 75,
      });
      expect(vetrScoreService.getScoreHistory).toHaveBeenCalledWith('NXE', 6);
    });

    it('should use default months parameter if not provided', async () => {
      vi.mocked(vetrScoreService.getScoreHistory).mockResolvedValue([]);

      const response = await app.request('/v1/stocks/NXE/vetr-score/history', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(vetrScoreService.getScoreHistory).toHaveBeenCalledWith('NXE', 6);
    });
  });

  describe('GET /v1/stocks/:ticker/red-flags', () => {
    it('should return detected red flags with composite score', async () => {
      const mockRedFlags = {
        ticker: 'NXE',
        composite_score: 45.5,
        severity: 'Moderate' as const,
        flags: [
          {
            flag_type: 'consolidation_velocity',
            score: 60,
            weight: 0.3,
            weighted_score: 18,
            description: '3 share consolidations detected in the last 24 months',
          },
          {
            flag_type: 'financing_velocity',
            score: 40,
            weight: 0.25,
            weighted_score: 10,
            description: 'Raised $75M in last 12 months (early-stage threshold)',
          },
          {
            flag_type: 'executive_churn',
            score: 50,
            weight: 0.2,
            weighted_score: 10,
            description: '2 executive departures in last 18 months',
          },
          {
            flag_type: 'disclosure_gaps',
            score: 25,
            weight: 0.15,
            weighted_score: 3.75,
            description: 'Filing delayed by 35 days',
          },
          {
            flag_type: 'debt_trend',
            score: 50,
            weight: 0.1,
            weighted_score: 5,
            description: 'Debt increased 55% with 15% revenue growth',
          },
        ],
        detected_at: new Date('2024-01-15T10:00:00Z').toISOString(),
      };

      // Mock both detectRedFlags and getLatestFlagIdsForStock (used by route)
      vi.mocked(redFlagService.detectRedFlags).mockResolvedValue(mockRedFlags);
      vi.mocked(redFlagService.getLatestFlagIdsForStock).mockResolvedValue({
        consolidation_velocity: { id: 'flag-1', is_acknowledged: false },
        financing_velocity: { id: 'flag-2', is_acknowledged: false },
        executive_churn: { id: 'flag-3', is_acknowledged: false },
        disclosure_gaps: { id: 'flag-4', is_acknowledged: false },
        debt_trend: { id: 'flag-5', is_acknowledged: false },
      });

      const response = await app.request('/v1/stocks/NXE/red-flags', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      // The route transforms detectRedFlags output to frontend format:
      // { ticker, overall_score, breakdown, detected_flags }
      expect(data.data).toMatchObject({
        ticker: 'NXE',
        overall_score: 45.5,
      });
      expect(data.data.breakdown).toBeDefined();
      expect(data.data.breakdown.consolidation_velocity).toBe(60);
      // detected_flags only includes flags with score > 20
      expect(data.data.detected_flags).toBeInstanceOf(Array);
      expect(redFlagService.detectRedFlags).toHaveBeenCalledWith('NXE');
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/stocks/NXE/red-flags', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should handle stock with no red flags', async () => {
      const mockRedFlags = {
        ticker: 'WPM',
        composite_score: 5.0,
        severity: 'Low' as const,
        flags: [],
        detected_at: new Date('2024-01-15T10:00:00Z').toISOString(),
      };

      vi.mocked(redFlagService.detectRedFlags).mockResolvedValue(mockRedFlags);
      vi.mocked(redFlagService.getLatestFlagIdsForStock).mockResolvedValue({});

      const response = await app.request('/v1/stocks/WPM/red-flags', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.overall_score).toBe(5.0);
      expect(data.data.detected_flags).toHaveLength(0);
    });
  });

  describe('POST /v1/red-flags/:id/acknowledge', () => {
    it('should acknowledge a red flag for the current user', async () => {
      const redFlagId = crypto.randomUUID();
      const mockAcknowledgment = {
        red_flag_id: redFlagId,
        user_id: testUser.id,
        acknowledged_at: new Date('2024-01-15T10:00:00Z').toISOString(),
      };

      vi.mocked(redFlagService.acknowledgeRedFlag).mockResolvedValue(mockAcknowledgment);

      const response = await app.request(`/v1/red-flags/${redFlagId}/acknowledge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        red_flag_id: redFlagId,
        user_id: testUser.id,
      });
      expect(redFlagService.acknowledgeRedFlag).toHaveBeenCalledWith(testUser.id, redFlagId);
    });

    it('should require authentication', async () => {
      const redFlagId = crypto.randomUUID();

      const response = await app.request(`/v1/red-flags/${redFlagId}/acknowledge`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should handle non-existent red flag ID', async () => {
      const redFlagId = crypto.randomUUID();
      const { NotFoundError } = await import('../../src/utils/errors.js');
      vi.mocked(redFlagService.acknowledgeRedFlag).mockRejectedValue(
        new NotFoundError('Red flag not found')
      );

      const response = await app.request(`/v1/red-flags/${redFlagId}/acknowledge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Additional scoring endpoint tests', () => {
    it('should return VETR score trend data', async () => {
      const mockTrend = {
        direction: 'improving',
        momentum: 15.5,
        change_30d: 2,
        change_90d: 5,
      };

      vi.mocked(vetrScoreService.getScoreTrend).mockResolvedValue(mockTrend);

      const response = await app.request('/v1/stocks/NXE/vetr-score/trend', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        direction: 'improving',
        momentum: 15.5,
        change_30d: 2,
        change_90d: 5,
      });
    });

    it('should return sector peer comparison', async () => {
      const mockComparison = {
        ticker: 'NXE',
        score: 82,
        sector: 'Energy',
        percentile_rank: 75,
        peers: [
          { ticker: 'NXE', score: 82 },
          { ticker: 'ARIS', score: 78 },
          { ticker: 'LUN', score: 85 },
        ],
      };

      vi.mocked(vetrScoreService.getScoreComparison).mockResolvedValue(mockComparison);

      const response = await app.request('/v1/stocks/NXE/vetr-score/compare', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        ticker: 'NXE',
        score: 82,
        percentile_rank: 75,
      });
      expect(data.data.peers).toHaveLength(3);
    });
  });
});
