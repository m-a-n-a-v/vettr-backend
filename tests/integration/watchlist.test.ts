import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import * as watchlistService from '../../src/services/watchlist.service.js';
import { createTestUser, createTestToken, createAuthHeader } from '../helpers/auth.helper.js';

/**
 * Integration tests for watchlist endpoints.
 * These tests verify watchlist management including add, remove, and tier limit enforcement.
 */

// Mock the watchlist service functions
vi.mock('../../src/services/watchlist.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/watchlist.service.js')>(
    '../../src/services/watchlist.service.js'
  );
  return {
    ...actual,
    getWatchlist: vi.fn(),
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
  };
});

describe('Watchlist Endpoints Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /v1/watchlist', () => {
    it('should return empty array for new user', async () => {
      const testUser = createTestUser({
        email: 'newuser@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      vi.mocked(watchlistService.getWatchlist).mockResolvedValue([]);

      const response = await app.request('/v1/watchlist', {
        method: 'GET',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
      expect(watchlistService.getWatchlist).toHaveBeenCalledWith(testUser.id);
    });

    it('should return watchlist with stock data', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const mockWatchlistItems = [
        {
          id: crypto.randomUUID(),
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 10.50,
          priceChange: 0.15,
          vetrScore: 85,
          updatedAt: new Date('2026-01-15'),
          added_at: new Date('2026-01-10'),
        },
        {
          id: crypto.randomUUID(),
          ticker: 'ARIS',
          name: 'Aris Gold Corporation',
          exchange: 'TSX',
          sector: 'Materials',
          marketCap: 1500000000,
          price: 4.25,
          priceChange: -0.05,
          vetrScore: 78,
          updatedAt: new Date('2026-01-15'),
          added_at: new Date('2026-01-11'),
        },
      ];

      vi.mocked(watchlistService.getWatchlist).mockResolvedValue(mockWatchlistItems);

      const response = await app.request('/v1/watchlist', {
        method: 'GET',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0]).toMatchObject({
        ticker: 'NXE',
        name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        market_cap: 5000000000,
        price: 10.50,
        price_change: 0.15,
        vetr_score: 85,
      });
      expect(data.data[0]).toHaveProperty('added_at');
      expect(data.data[0]).toHaveProperty('updated_at');
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/watchlist', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
      expect(watchlistService.getWatchlist).not.toHaveBeenCalled();
    });
  });

  describe('POST /v1/watchlist/:ticker', () => {
    it('should add stock to watchlist', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const mockStock = {
        id: crypto.randomUUID(),
        ticker: 'NXE',
        name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        marketCap: 5000000000,
        price: 10.50,
        priceChange: 0.15,
        vetrScore: 85,
        updatedAt: new Date('2026-01-15'),
        added_at: new Date(),
      };

      vi.mocked(watchlistService.addToWatchlist).mockResolvedValue(mockStock);

      const response = await app.request('/v1/watchlist/NXE', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        ticker: 'NXE',
        name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        market_cap: 5000000000,
        price: 10.50,
        price_change: 0.15,
        vetr_score: 85,
      });
      expect(data.data).toHaveProperty('added_at');
      expect(watchlistService.addToWatchlist).toHaveBeenCalledWith(
        testUser.id,
        'NXE',
        testUser.tier
      );
    });

    it('should handle lowercase ticker by normalizing', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const mockStock = {
        id: crypto.randomUUID(),
        ticker: 'NXE',
        name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        marketCap: 5000000000,
        price: 10.50,
        priceChange: 0.15,
        vetrScore: 85,
        updatedAt: new Date('2026-01-15'),
        added_at: new Date(),
      };

      vi.mocked(watchlistService.addToWatchlist).mockResolvedValue(mockStock);

      const response = await app.request('/v1/watchlist/nxe', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.ticker).toBe('NXE');
      expect(watchlistService.addToWatchlist).toHaveBeenCalledWith(
        testUser.id,
        'nxe',
        testUser.tier
      );
    });

    it('should return 404 for non-existent stock', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const { NotFoundError } = await import('../../src/utils/errors.js');
      vi.mocked(watchlistService.addToWatchlist).mockRejectedValue(
        new NotFoundError("Stock with ticker 'INVALID' not found")
      );

      const response = await app.request('/v1/watchlist/INVALID', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/watchlist/NXE', {
        method: 'POST',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
      expect(watchlistService.addToWatchlist).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /v1/watchlist/:ticker', () => {
    it('should remove stock from watchlist', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      vi.mocked(watchlistService.removeFromWatchlist).mockResolvedValue({
        deleted: true,
      });

      const response = await app.request('/v1/watchlist/NXE', {
        method: 'DELETE',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(watchlistService.removeFromWatchlist).toHaveBeenCalledWith(
        testUser.id,
        'NXE'
      );
    });

    it('should return 404 if stock not in watchlist', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const { NotFoundError } = await import('../../src/utils/errors.js');
      vi.mocked(watchlistService.removeFromWatchlist).mockRejectedValue(
        new NotFoundError("Stock 'NXE' is not in your watchlist")
      );

      const response = await app.request('/v1/watchlist/NXE', {
        method: 'DELETE',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/watchlist/NXE', {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
      expect(watchlistService.removeFromWatchlist).not.toHaveBeenCalled();
    });
  });

  describe('Tier limit enforcement', () => {
    it('should enforce FREE tier limit (5 stocks)', async () => {
      const testUser = createTestUser({
        email: 'freeuser@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const { TierLimitError } = await import('../../src/utils/errors.js');
      vi.mocked(watchlistService.addToWatchlist).mockRejectedValue(
        new TierLimitError('Watchlist limit reached for FREE tier', {
          current_count: 5,
          max_allowed: 5,
          tier: 'free',
        })
      );

      const response = await app.request('/v1/watchlist/FM', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('TIER_LIMIT_EXCEEDED');
      expect(data.error.details).toMatchObject({
        current_count: 5,
        max_allowed: 5,
        tier: 'free',
      });
    });

    it('should allow FREE tier user to add up to 5 stocks', async () => {
      const testUser = createTestUser({
        email: 'freeuser@example.com',
        tier: 'free',
      });
      const token = createTestToken(testUser);

      const mockStock = {
        id: crypto.randomUUID(),
        ticker: 'NXE',
        name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        marketCap: 5000000000,
        price: 10.50,
        priceChange: 0.15,
        vetrScore: 85,
        updatedAt: new Date('2026-01-15'),
        added_at: new Date(),
      };

      vi.mocked(watchlistService.addToWatchlist).mockResolvedValue(mockStock);

      const response = await app.request('/v1/watchlist/NXE', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.ticker).toBe('NXE');
    });

    it('should enforce PRO tier limit (25 stocks)', async () => {
      const testUser = createTestUser({
        email: 'prouser@example.com',
        tier: 'pro',
      });
      const token = createTestToken(testUser);

      const { TierLimitError } = await import('../../src/utils/errors.js');
      vi.mocked(watchlistService.addToWatchlist).mockRejectedValue(
        new TierLimitError('Watchlist limit reached for PRO tier', {
          current_count: 25,
          max_allowed: 25,
          tier: 'pro',
        })
      );

      const response = await app.request('/v1/watchlist/FM', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('TIER_LIMIT_EXCEEDED');
      expect(data.error.details).toMatchObject({
        current_count: 25,
        max_allowed: 25,
        tier: 'pro',
      });
    });

    it('should allow PREMIUM tier unlimited watchlist', async () => {
      const testUser = createTestUser({
        email: 'premiumuser@example.com',
        tier: 'premium',
      });
      const token = createTestToken(testUser);

      const mockStock = {
        id: crypto.randomUUID(),
        ticker: 'NXE',
        name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        marketCap: 5000000000,
        price: 10.50,
        priceChange: 0.15,
        vetrScore: 85,
        updatedAt: new Date('2026-01-15'),
        added_at: new Date(),
      };

      vi.mocked(watchlistService.addToWatchlist).mockResolvedValue(mockStock);

      // Premium users should be able to add without limit
      const response = await app.request('/v1/watchlist/NXE', {
        method: 'POST',
        headers: {
          Authorization: createAuthHeader(token),
        },
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.ticker).toBe('NXE');
      expect(watchlistService.addToWatchlist).toHaveBeenCalledWith(
        testUser.id,
        'NXE',
        'premium'
      );
    });
  });
});
