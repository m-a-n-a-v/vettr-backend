import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';
import { sql } from 'drizzle-orm';

/**
 * Integration tests for admin analytics endpoints.
 * These tests verify the analytics aggregation queries return correct data shapes.
 */

const ADMIN_SECRET = 'test-admin-secret';

// Mock env config with hardcoded values (no vi.importActual to avoid CI timing issues)
vi.mock('../src/config/env.js', () => ({
  env: {
    PORT: 3001,
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
    CORS_ORIGIN: '*',
    ADMIN_SECRET: 'test-admin-secret',
  },
}));

// Mock the database module with a mock db object
vi.mock('../src/config/database.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

describe('Admin Analytics Endpoints Integration Tests', () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked database instance
    const dbModule = await import('../src/config/database.js');
    mockDb = dbModule.db;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /v1/admin/analytics/user-growth', () => {
    it('should return 200 with array of date and count objects', async () => {
      const mockData = [
        { date: '2024-01-01', count: 5 },
        { date: '2024-01-02', count: 8 },
        { date: '2024-01-03', count: 12 },
      ];

      mockDb.execute.mockResolvedValue({
        rows: mockData,
      });

      const response = await app.request('/v1/admin/analytics/user-growth', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeInstanceOf(Array);
      expect(data.data.data).toHaveLength(3);
      expect(data.data.data[0]).toMatchObject({
        date: expect.any(String),
        count: expect.any(Number),
      });
      expect(data.meta).toBeDefined();
      expect(data.meta.timestamp).toBeDefined();
      expect(data.meta.request_id).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/user-growth', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/admin/analytics/score-distribution', () => {
    it('should return 200 with array of range and count objects', async () => {
      const mockData = [
        { range: '0-20', count: 3 },
        { range: '21-40', count: 7 },
        { range: '41-60', count: 15 },
        { range: '61-80', count: 25 },
        { range: '81-100', count: 10 },
      ];

      mockDb.execute.mockResolvedValue({
        rows: mockData,
      });

      const response = await app.request('/v1/admin/analytics/score-distribution', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeInstanceOf(Array);
      expect(data.data.data).toHaveLength(5);
      expect(data.data.data[0]).toMatchObject({
        range: expect.any(String),
        count: expect.any(Number),
      });
      expect(data.meta).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/score-distribution', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/admin/analytics/red-flag-trends', () => {
    it('should return 200 with array of date, severity, and count objects', async () => {
      const mockData = [
        { date: '2024-01-01', severity: 'Low', count: 2 },
        { date: '2024-01-01', severity: 'High', count: 1 },
        { date: '2024-01-02', severity: 'Moderate', count: 3 },
        { date: '2024-01-02', severity: 'Critical', count: 1 },
      ];

      mockDb.execute.mockResolvedValue({
        rows: mockData,
      });

      const response = await app.request('/v1/admin/analytics/red-flag-trends', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeInstanceOf(Array);
      expect(data.data.data).toHaveLength(4);
      expect(data.data.data[0]).toMatchObject({
        date: expect.any(String),
        severity: expect.any(String),
        count: expect.any(Number),
      });
      expect(data.meta).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/red-flag-trends', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/admin/analytics/filing-activity', () => {
    it('should return 200 with array of date and count objects', async () => {
      const mockData = [
        { date: '2024-01-01', count: 10 },
        { date: '2024-01-02', count: 15 },
        { date: '2024-01-03', count: 8 },
      ];

      mockDb.execute.mockResolvedValue({
        rows: mockData,
      });

      const response = await app.request('/v1/admin/analytics/filing-activity', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeInstanceOf(Array);
      expect(data.data.data).toHaveLength(3);
      expect(data.data.data[0]).toMatchObject({
        date: expect.any(String),
        count: expect.any(Number),
      });
      expect(data.meta).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/filing-activity', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/admin/analytics/alert-activity', () => {
    it('should return 200 with array of date and count objects', async () => {
      const mockData = [
        { date: '2024-01-01', count: 20 },
        { date: '2024-01-02', count: 25 },
        { date: '2024-01-03', count: 18 },
      ];

      mockDb.execute.mockResolvedValue({
        rows: mockData,
      });

      const response = await app.request('/v1/admin/analytics/alert-activity', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeInstanceOf(Array);
      expect(data.data.data).toHaveLength(3);
      expect(data.data.data[0]).toMatchObject({
        date: expect.any(String),
        count: expect.any(Number),
      });
      expect(data.meta).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/alert-activity', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/admin/analytics/tier-breakdown', () => {
    it('should return 200 with array of tier and count objects', async () => {
      const mockData = [
        { tier: 'free', count: 100 },
        { tier: 'premium', count: 20 },
        { tier: 'pro', count: 50 },
      ];

      mockDb.execute.mockResolvedValue({
        rows: mockData,
      });

      const response = await app.request('/v1/admin/analytics/tier-breakdown', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeInstanceOf(Array);
      expect(data.data.data).toHaveLength(3);
      expect(data.data.data[0]).toMatchObject({
        tier: expect.any(String),
        count: expect.any(Number),
      });
      expect(data.meta).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/tier-breakdown', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/admin/analytics/stock-health', () => {
    it('should return 200 with lowest_scores and most_flags arrays', async () => {
      const mockLowestScores = [
        { ticker: 'ABC', name: 'ABC Corp', vetr_score: 25.5 },
        { ticker: 'DEF', name: 'DEF Inc', vetr_score: 30.2 },
      ];

      const mockMostFlags = [
        { ticker: 'XYZ', name: 'XYZ Ltd', flag_count: 15 },
        { ticker: 'QRS', name: 'QRS Co', flag_count: 10 },
      ];

      // Mock two sequential calls to db.execute (one for lowest scores, one for most flags)
      mockDb.execute
        .mockResolvedValueOnce({
          rows: mockLowestScores,
        })
        .mockResolvedValueOnce({
          rows: mockMostFlags,
        });

      const response = await app.request('/v1/admin/analytics/stock-health', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify response shape
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.data).toBeDefined();
      expect(data.data.data.lowest_scores).toBeInstanceOf(Array);
      expect(data.data.data.most_flags).toBeInstanceOf(Array);
      expect(data.data.data.lowest_scores).toHaveLength(2);
      expect(data.data.data.most_flags).toHaveLength(2);

      // Check lowest_scores structure
      expect(data.data.data.lowest_scores[0]).toMatchObject({
        ticker: expect.any(String),
        name: expect.any(String),
        vetr_score: expect.any(Number),
      });

      // Check most_flags structure
      expect(data.data.data.most_flags[0]).toMatchObject({
        ticker: expect.any(String),
        name: expect.any(String),
        flag_count: expect.any(Number),
      });

      expect(data.meta).toBeDefined();
    });

    it('should return 401 without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/analytics/stock-health', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
