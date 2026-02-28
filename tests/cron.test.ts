import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';

/**
 * Integration tests for cron endpoints.
 * These tests verify cron authentication, chunked processing, and endpoint responses.
 */

const CRON_SECRET = 'test-cron-secret';

// Mock env config with hardcoded values including CRON_SECRET
vi.mock('../src/config/env.js', () => ({
  env: {
    PORT: 3001,
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
    CORS_ORIGIN: '*',
    CRON_SECRET: 'test-cron-secret',
  },
}));

// Mock the cron service with hoisted functions to share across all test instances
const { mockRefreshMarketDataChunk, mockRefreshScoresChunk, mockRefreshRedFlagsChunk } = vi.hoisted(
  () => ({
    mockRefreshMarketDataChunk: vi.fn(),
    mockRefreshScoresChunk: vi.fn(),
    mockRefreshRedFlagsChunk: vi.fn(),
  })
);

vi.mock('../src/services/cron.service.js', () => ({
  refreshMarketDataChunk: mockRefreshMarketDataChunk,
  refreshScoresChunk: mockRefreshScoresChunk,
  refreshRedFlagsChunk: mockRefreshRedFlagsChunk,
}));

// Mock cache service
const { mockGet, mockSet, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock('../src/services/cache.service.js', () => ({
  get: mockGet,
  set: mockSet,
  del: mockDel,
}));

// Mock database to prevent real DB queries
vi.mock('../src/config/database.js', () => {
  const mockDb: any = {
    select: vi.fn(),
    from: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };

  // Set up chaining
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.orderBy.mockReturnValue(mockDb);
  mockDb.limit.mockReturnValue(mockDb);
  mockDb.offset.mockReturnValue(mockDb);

  // Make the final result thenable (for await) - returns count query result
  mockDb.then = vi.fn((resolve: any) => Promise.resolve([{ value: 1300 }]).then(resolve));

  return { db: mockDb };
});

describe('Cron Endpoints Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-setup database mock chain for each test
    const { db } = await import('../src/config/database.js');
    const mockDb = db as any;
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(mockDb);
    mockDb.offset.mockReturnValue(mockDb);
    mockDb.then = vi.fn((resolve: any) => Promise.resolve([{ value: 1300 }]).then(resolve));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when CRON_SECRET is set and no Authorization header is provided', async () => {
      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
      expect(mockRefreshScoresChunk).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header has wrong token', async () => {
      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer wrong-token',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
      expect(mockRefreshScoresChunk).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header is missing Bearer prefix', async () => {
      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: 'test-cron-secret',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should accept valid Bearer token', async () => {
      mockRefreshScoresChunk.mockResolvedValue({
        job: 'refresh-scores',
        stocks_processed: 10,
        succeeded: 10,
        failed: 0,
        failures: [],
        duration_ms: 1500,
        completed_at: new Date().toISOString(),
        chunk_info: {
          current_offset: 0,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      });

      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      expect(mockRefreshScoresChunk).toHaveBeenCalled();
    });
  });

  describe('GET /v1/cron/scores', () => {
    it('should return 200 with correct response shape when properly authenticated', async () => {
      const mockResult = {
        job: 'refresh-scores',
        stocks_processed: 100,
        succeeded: 98,
        failed: 2,
        failures: [
          { ticker: 'AAPL', error: 'Network timeout' },
          { ticker: 'TSLA', error: 'API error' },
        ],
        duration_ms: 45000,
        completed_at: '2026-02-19T12:00:00.000Z',
        chunk_info: {
          current_offset: 100,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      };

      mockRefreshScoresChunk.mockResolvedValue(mockResult);

      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        job: 'refresh-scores',
        stocks_processed: 100,
        succeeded: 98,
        failed: 2,
        failures: expect.arrayContaining([
          expect.objectContaining({ ticker: 'AAPL', error: 'Network timeout' }),
          expect.objectContaining({ ticker: 'TSLA', error: 'API error' }),
        ]),
        duration_ms: 45000,
        completed_at: '2026-02-19T12:00:00.000Z',
        chunk_info: {
          current_offset: 100,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      });

      expect(mockRefreshScoresChunk).toHaveBeenCalled();
    });

    it('should handle empty failures array when all tickers succeed', async () => {
      const mockResult = {
        job: 'refresh-scores',
        stocks_processed: 50,
        succeeded: 50,
        failed: 0,
        failures: [],
        duration_ms: 20000,
        completed_at: new Date().toISOString(),
        chunk_info: {
          current_offset: 50,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      };

      mockRefreshScoresChunk.mockResolvedValue(mockResult);

      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.failures).toEqual([]);
      expect(data.data.failed).toBe(0);
      expect(data.data.succeeded).toBe(50);
    });

    it('should set is_complete to true when reaching end of ticker list', async () => {
      const mockResult = {
        job: 'refresh-scores',
        stocks_processed: 100,
        succeeded: 100,
        failed: 0,
        failures: [],
        duration_ms: 40000,
        completed_at: new Date().toISOString(),
        chunk_info: {
          current_offset: 1300,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: true,
        },
      };

      mockRefreshScoresChunk.mockResolvedValue(mockResult);

      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.chunk_info.is_complete).toBe(true);
      expect(data.data.chunk_info.current_offset).toBe(1300);
    });
  });

  describe('GET /v1/cron/red-flags', () => {
    it('should return 200 with similar shape but job: refresh-red-flags', async () => {
      const mockResult = {
        job: 'refresh-red-flags',
        stocks_processed: 75,
        succeeded: 74,
        failed: 1,
        failures: [{ ticker: 'GOOGL', error: 'Database connection lost' }],
        duration_ms: 35000,
        completed_at: '2026-02-19T14:30:00.000Z',
        chunk_info: {
          current_offset: 75,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      };

      mockRefreshRedFlagsChunk.mockResolvedValue(mockResult);

      const response = await app.request('/v1/cron/red-flags', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        job: 'refresh-red-flags',
        stocks_processed: 75,
        succeeded: 74,
        failed: 1,
        failures: [{ ticker: 'GOOGL', error: 'Database connection lost' }],
        duration_ms: 35000,
        completed_at: '2026-02-19T14:30:00.000Z',
        chunk_info: {
          current_offset: 75,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      });

      expect(mockRefreshRedFlagsChunk).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/cron/red-flags', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      expect(mockRefreshRedFlagsChunk).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/cron/status', () => {
    it('should return 200 with progress information', async () => {
      // Mock cache.get to return offsets (order: market-data, scores, red-flags)
      mockGet
        .mockResolvedValueOnce(200) // market_data_offset
        .mockResolvedValueOnce(300) // scores_offset
        .mockResolvedValueOnce(400); // red_flags_offset

      const response = await app.request('/v1/cron/status', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('market_data_offset');
      expect(data.data).toHaveProperty('scores_offset');
      expect(data.data).toHaveProperty('red_flags_offset');
      expect(data.data).toHaveProperty('total_stocks');
      expect(data.data).toHaveProperty('market_data_progress_pct');
      expect(data.data).toHaveProperty('scores_progress_pct');
      expect(data.data).toHaveProperty('red_flags_progress_pct');

      // Verify cache.get was called for all three offsets
      expect(mockGet).toHaveBeenCalledWith('cron:market-data:offset');
      expect(mockGet).toHaveBeenCalledWith('cron:scores:offset');
      expect(mockGet).toHaveBeenCalledWith('cron:red-flags:offset');
    });

    it('should handle null offsets (start of cycle)', async () => {
      // Mock cache.get to return null (no cursor set yet)
      mockGet.mockResolvedValue(null);

      const response = await app.request('/v1/cron/status', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.market_data_offset).toBe(0);
      expect(data.data.scores_offset).toBe(0);
      expect(data.data.red_flags_offset).toBe(0);
      expect(data.data.market_data_progress_pct).toBe(0);
      expect(data.data.scores_progress_pct).toBe(0);
      expect(data.data.red_flags_progress_pct).toBe(0);
    });

    it('should calculate progress percentages correctly', async () => {
      // Mock offsets: market-data 325/1300=25%, scores 650/1300=50%, red-flags 1300/1300=100%
      mockGet
        .mockResolvedValueOnce(325)  // market_data_offset (25%)
        .mockResolvedValueOnce(650)  // scores_offset (50%)
        .mockResolvedValueOnce(1300); // red_flags_offset (100%)

      const response = await app.request('/v1/cron/status', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.market_data_progress_pct).toBe(25);
      expect(data.data.scores_progress_pct).toBe(50);
      expect(data.data.red_flags_progress_pct).toBe(100);
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/cron/status', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/cron/reset', () => {
    it('should return 200 and reset cursor positions', async () => {
      mockDel.mockResolvedValue(undefined);

      const response = await app.request('/v1/cron/reset', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('message');
      expect(data.data.message).toContain('reset');

      // Verify cache.del was called for all three cursor keys
      expect(mockDel).toHaveBeenCalledWith('cron:market-data:offset');
      expect(mockDel).toHaveBeenCalledWith('cron:scores:offset');
      expect(mockDel).toHaveBeenCalledWith('cron:red-flags:offset');
      expect(mockDel).toHaveBeenCalledTimes(3);
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/cron/reset', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      });

      expect(response.status).toBe(401);
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should reset even if cursors do not exist', async () => {
      // cache.del is idempotent - works even if key doesn't exist
      mockDel.mockResolvedValue(undefined);

      const response = await app.request('/v1/cron/reset', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      expect(mockDel).toHaveBeenCalledTimes(3);
    });
  });

  describe('Response format validation', () => {
    it('should return snake_case fields in all cron responses', async () => {
      const mockResult = {
        job: 'refresh-scores',
        stocks_processed: 10,
        succeeded: 10,
        failed: 0,
        failures: [],
        duration_ms: 1000,
        completed_at: new Date().toISOString(),
        chunk_info: {
          current_offset: 10,
          chunk_size: 100,
          total_stocks: 1300,
          is_complete: false,
        },
      };

      mockRefreshScoresChunk.mockResolvedValue(mockResult);

      const response = await app.request('/v1/cron/scores', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      const data = await response.json();

      // Verify all fields use snake_case
      expect(data.data).toHaveProperty('stocks_processed');
      expect(data.data).toHaveProperty('duration_ms');
      expect(data.data).toHaveProperty('completed_at');
      expect(data.data).toHaveProperty('chunk_info');
      expect(data.data.chunk_info).toHaveProperty('current_offset');
      expect(data.data.chunk_info).toHaveProperty('chunk_size');
      expect(data.data.chunk_info).toHaveProperty('total_stocks');
      expect(data.data.chunk_info).toHaveProperty('is_complete');

      // Should not have camelCase equivalents
      expect(data.data).not.toHaveProperty('stocksProcessed');
      expect(data.data).not.toHaveProperty('durationMs');
      expect(data.data).not.toHaveProperty('completedAt');
    });

    it('should include success: true wrapper in all responses', async () => {
      mockGet.mockResolvedValue(0);

      const response = await app.request('/v1/cron/status', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      const data = await response.json();

      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('timestamp');
    });
  });
});
