import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import * as stockService from '../../src/services/stock.service.js';
import * as filingService from '../../src/services/filing.service.js';
import * as executiveService from '../../src/services/executive.service.js';
import { createTestUser, createTestToken } from '../helpers/auth.helper.js';

/**
 * Integration tests for stock and filing endpoints.
 * These tests verify the full stock listing, search, detail, and filing workflows.
 */

// Mock the stock service
vi.mock('../../src/services/stock.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/stock.service.js')>(
    '../../src/services/stock.service.js'
  );
  return {
    ...actual,
    getStocks: vi.fn(),
    getStockByTicker: vi.fn(),
    searchStocks: vi.fn(),
  };
});

// Mock the filing service
vi.mock('../../src/services/filing.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/filing.service.js')>(
    '../../src/services/filing.service.js'
  );
  return {
    ...actual,
    getLatestFilings: vi.fn(),
    getFilingById: vi.fn(),
    getFilingsByStock: vi.fn(),
    markAsRead: vi.fn(),
  };
});

// Mock the executive service
vi.mock('../../src/services/executive.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/executive.service.js')>(
    '../../src/services/executive.service.js'
  );
  return {
    ...actual,
    getExecutivesForStock: vi.fn(),
  };
});

describe('Stock and Filing Endpoints Integration Tests', () => {
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

  describe('GET /v1/stocks', () => {
    it('should return paginated stock list', async () => {
      const mockStocks = [
        {
          id: crypto.randomUUID(),
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 12.45,
          priceChange: 0.05,
          vetrScore: 85,
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: crypto.randomUUID(),
          ticker: 'ARIS',
          name: 'Aris Mining Corporation',
          exchange: 'TSX',
          sector: 'Mining',
          marketCap: 2000000000,
          price: 8.23,
          priceChange: -0.02,
          vetrScore: 78,
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(stockService.getStocks).mockResolvedValue({
        stocks: mockStocks,
        pagination: {
          total: 25,
          limit: 20,
          offset: 0,
          has_more: true,
        },
      });

      const response = await app.request('/v1/stocks', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0]).toMatchObject({
        ticker: 'NXE',
        company_name: 'NexGen Energy Ltd.',
        exchange: 'TSX',
        sector: 'Energy',
        market_cap: 5000000000,
        current_price: 12.45,
        price_change_percent: 0.05,
        vetr_score: 85,
      });
      expect(data.data.pagination).toMatchObject({
        total: 25,
        limit: 20,
        offset: 0,
        has_more: true,
      });
    });

    it('should filter stocks by sector', async () => {
      const mockStocks = [
        {
          id: crypto.randomUUID(),
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 12.45,
          priceChange: 0.05,
          vetrScore: 85,
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(stockService.getStocks).mockResolvedValue({
        stocks: mockStocks,
        pagination: {
          total: 1,
          limit: 20,
          offset: 0,
          has_more: false,
        },
      });

      const response = await app.request('/v1/stocks?sector=Energy', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].sector).toBe('Energy');
      expect(stockService.getStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          sector: 'Energy',
        })
      );
    });

    it('should sort stocks by vetr_score descending', async () => {
      const mockStocks = [
        {
          id: crypto.randomUUID(),
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 12.45,
          priceChange: 0.05,
          vetrScore: 85,
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: crypto.randomUUID(),
          ticker: 'ARIS',
          name: 'Aris Mining Corporation',
          exchange: 'TSX',
          sector: 'Mining',
          marketCap: 2000000000,
          price: 8.23,
          priceChange: -0.02,
          vetrScore: 78,
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(stockService.getStocks).mockResolvedValue({
        stocks: mockStocks,
        pagination: {
          total: 2,
          limit: 20,
          offset: 0,
          has_more: false,
        },
      });

      const response = await app.request('/v1/stocks?sort=vetr_score&order=desc', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(stockService.getStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'vetr_score',
          order: 'desc',
        })
      );
    });

    it('should search stocks by name or ticker', async () => {
      const mockStocks = [
        {
          id: crypto.randomUUID(),
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 12.45,
          priceChange: 0.05,
          vetrScore: 85,
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(stockService.getStocks).mockResolvedValue({
        stocks: mockStocks,
        pagination: {
          total: 1,
          limit: 20,
          offset: 0,
          has_more: false,
        },
      });

      const response = await app.request('/v1/stocks?search=NexGen', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(stockService.getStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'NexGen',
        })
      );
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/stocks', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /v1/stocks/search', () => {
    it('should search stocks and return results', async () => {
      const mockStocks = [
        {
          id: crypto.randomUUID(),
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 12.45,
          priceChange: 0.05,
          vetrScore: 85,
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(stockService.searchStocks).mockResolvedValue(mockStocks);

      const response = await app.request('/v1/stocks/search?q=NXE', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].ticker).toBe('NXE');
      expect(stockService.searchStocks).toHaveBeenCalledWith('NXE', 10);
    });

    it('should require search query parameter', async () => {
      const response = await app.request('/v1/stocks/search', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(422);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /v1/stocks/:ticker', () => {
    it('should return stock detail with executives and filings', async () => {
      const mockStockId = crypto.randomUUID();
      const mockStockDetail = {
        stock: {
          id: mockStockId,
          ticker: 'NXE',
          name: 'NexGen Energy Ltd.',
          exchange: 'TSX',
          sector: 'Energy',
          marketCap: 5000000000,
          price: 12.45,
          priceChange: 0.05,
          vetrScore: 85,
          updatedAt: new Date('2024-01-01'),
        },
        executives_summary: {
          total: 5,
          top: [
            {
              id: crypto.randomUUID(),
              stockId: mockStockId,
              name: 'John Doe',
              title: 'CEO',
              yearsAtCompany: 5.5,
              previousCompanies: ['Company A', 'Company B'],
              education: 'MBA, Harvard',
              specialization: 'Mining',
              socialLinkedin: 'https://linkedin.com/in/johndoe',
              socialTwitter: null,
              createdAt: new Date('2024-01-01'),
              updatedAt: new Date('2024-01-01'),
            },
          ],
        },
        recent_filings: [
          {
            id: crypto.randomUUID(),
            stockId: mockStockId,
            type: 'Press Release',
            title: 'Q4 Results',
            date: new Date('2024-01-15'),
            summary: 'Strong Q4 performance',
            isMaterial: true,
            sourceUrl: 'https://example.com/filing',
            createdAt: new Date('2024-01-15'),
          },
        ],
        is_favorite: false,
      };

      vi.mocked(stockService.getStockByTicker).mockResolvedValue(mockStockDetail);

      const response = await app.request('/v1/stocks/NXE', {
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
        company_name: 'NexGen Energy Ltd.',
      });
      expect(data.data.executives_summary.total).toBe(5);
      expect(data.data.executives_summary.top).toHaveLength(1);
      expect(data.data.recent_filings).toHaveLength(1);
      expect(data.data.is_favorite).toBe(false);
    });

    it('should return 404 for non-existent ticker', async () => {
      const { NotFoundError } = await import('../../src/utils/errors.js');
      vi.mocked(stockService.getStockByTicker).mockRejectedValue(
        new NotFoundError('Stock not found')
      );

      const response = await app.request('/v1/stocks/INVALID', {
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

  describe('GET /v1/filings', () => {
    it('should return paginated filings list', async () => {
      const mockFilings = [
        {
          filing: {
            id: crypto.randomUUID(),
            stockId: crypto.randomUUID(),
            type: 'Press Release',
            title: 'Q4 Results',
            date: new Date('2024-01-15'),
            summary: 'Strong Q4 performance',
            isMaterial: true,
            sourceUrl: 'https://example.com/filing',
            createdAt: new Date('2024-01-15'),
          },
          stock_ticker: 'NXE',
          stock_name: 'NexGen Energy Ltd.',
        },
        {
          filing: {
            id: crypto.randomUUID(),
            stockId: crypto.randomUUID(),
            type: 'MD&A',
            title: "Management's Discussion",
            date: new Date('2024-01-10'),
            summary: 'Annual MD&A report',
            isMaterial: false,
            sourceUrl: null,
            createdAt: new Date('2024-01-10'),
          },
          stock_ticker: 'ARIS',
          stock_name: 'Aris Mining Corporation',
        },
      ];

      vi.mocked(filingService.getLatestFilings).mockResolvedValue({
        filings: mockFilings,
        pagination: {
          total: 75,
          limit: 20,
          offset: 0,
          has_more: true,
        },
      });

      const response = await app.request('/v1/filings', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0]).toMatchObject({
        type: 'Press Release',
        title: 'Q4 Results',
        ticker: 'NXE',
        company_name: 'NexGen Energy Ltd.',
      });
      expect(data.data.pagination).toMatchObject({
        total: 75,
        limit: 20,
        offset: 0,
        has_more: true,
      });
    });
  });

  describe('GET /v1/filings/:id', () => {
    it('should return filing detail with read status', async () => {
      const mockFilingId = crypto.randomUUID();
      const mockFiling = {
        filing: {
          id: mockFilingId,
          stockId: crypto.randomUUID(),
          type: 'Press Release',
          title: 'Q4 Results',
          date: new Date('2024-01-15'),
          summary: 'Strong Q4 performance',
          isMaterial: true,
          sourceUrl: 'https://example.com/filing',
          createdAt: new Date('2024-01-15'),
        },
        is_read: false,
      };

      vi.mocked(filingService.getFilingById).mockResolvedValue(mockFiling);

      const response = await app.request(`/v1/filings/${mockFilingId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: mockFilingId,
        type: 'Press Release',
        title: 'Q4 Results',
        is_read: false,
      });
      expect(filingService.getFilingById).toHaveBeenCalledWith(mockFilingId, testUser.id);
    });
  });

  describe('POST /v1/filings/:id/read', () => {
    it('should mark filing as read', async () => {
      const mockFilingId = crypto.randomUUID();

      vi.mocked(filingService.markAsRead).mockResolvedValue();

      const response = await app.request(`/v1/filings/${mockFilingId}/read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        filing_id: mockFilingId,
        is_read: true,
      });
      expect(filingService.markAsRead).toHaveBeenCalledWith(mockFilingId, testUser.id);
    });

    it('should require authentication', async () => {
      const mockFilingId = crypto.randomUUID();

      const response = await app.request(`/v1/filings/${mockFilingId}/read`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
