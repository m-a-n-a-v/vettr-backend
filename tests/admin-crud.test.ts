import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';

/**
 * Integration tests for admin CRUD endpoints.
 * These tests verify the generic admin CRUD functionality for managing database tables.
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

// Mock the admin CRUD service - all instances share the same mock methods via vi.hoisted
const { mockListRecords, mockGetById, mockCreateRecord, mockUpdateRecord, mockDeleteRecord } = vi.hoisted(() => ({
  mockListRecords: vi.fn(),
  mockGetById: vi.fn(),
  mockCreateRecord: vi.fn(),
  mockUpdateRecord: vi.fn(),
  mockDeleteRecord: vi.fn(),
}));

vi.mock('../src/services/admin-crud.service.js', () => ({
  AdminCrudService: vi.fn().mockImplementation(() => ({
    listRecords: mockListRecords,
    getById: mockGetById,
    createRecord: mockCreateRecord,
    updateRecord: mockUpdateRecord,
    deleteRecord: mockDeleteRecord,
  })),
}));

describe('Admin CRUD Endpoints Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /v1/admin/users', () => {
    it('should return paginated response with correct shape', async () => {
      const mockUsers = [
        {
          id: crypto.randomUUID(),
          email: 'user1@example.com',
          displayName: 'User One',
          tier: 'free',
          authProvider: 'email',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: crypto.randomUUID(),
          email: 'user2@example.com',
          displayName: 'User Two',
          tier: 'pro',
          authProvider: 'google',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      mockListRecords.mockResolvedValue({
        items: mockUsers,
        pagination: {
          total: 50,
          limit: 25,
          offset: 0,
          has_more: true,
        },
      });

      const response = await app.request('/v1/admin/users', {
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
      expect(data.data.items).toHaveLength(2);
      expect(data.data.pagination).toMatchObject({
        total: 50,
        limit: 25,
        offset: 0,
        has_more: true,
      });
      expect(data.meta).toBeDefined();
      expect(data.meta.timestamp).toBeDefined();
      expect(data.meta.request_id).toBeDefined();
    });

    it('should support search parameter', async () => {
      const mockUsers = [
        {
          id: crypto.randomUUID(),
          email: 'john@example.com',
          displayName: 'John Doe',
          tier: 'free',
          authProvider: 'email',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockListRecords.mockResolvedValue({
        items: mockUsers,
        pagination: {
          total: 1,
          limit: 25,
          offset: 0,
          has_more: false,
        },
      });

      const response = await app.request('/v1/admin/users?search=john', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(mockListRecords).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          search: 'john',
        })
      );
    });

    it('should support sort parameter', async () => {
      const mockUsers = [
        {
          id: crypto.randomUUID(),
          email: 'a@example.com',
          displayName: 'Alice',
          tier: 'pro',
          authProvider: 'email',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: crypto.randomUUID(),
          email: 'z@example.com',
          displayName: 'Zoe',
          tier: 'free',
          authProvider: 'email',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      mockListRecords.mockResolvedValue({
        items: mockUsers,
        pagination: {
          total: 2,
          limit: 25,
          offset: 0,
          has_more: false,
        },
      });

      const response = await app.request('/v1/admin/users?sort=createdAt:desc', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(mockListRecords).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          sort: 'createdAt:desc',
        })
      );
    });

    it('should support filter parameters', async () => {
      const mockUsers = [
        {
          id: crypto.randomUUID(),
          email: 'free@example.com',
          displayName: 'Free User',
          tier: 'free',
          authProvider: 'email',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockListRecords.mockResolvedValue({
        items: mockUsers,
        pagination: {
          total: 1,
          limit: 25,
          offset: 0,
          has_more: false,
        },
      });

      const response = await app.request('/v1/admin/users?filter_tier=free', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].tier).toBe('free');
      expect(mockListRecords).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          filters: expect.objectContaining({
            tier: 'free',
          }),
        })
      );
    });
  });

  describe('GET /v1/admin/users/:id', () => {
    it('should return single user record when ID exists', async () => {
      const userId = crypto.randomUUID();
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        tier: 'pro',
        authProvider: 'email',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockGetById.mockResolvedValue(mockUser);

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        tier: 'pro',
      });
      expect(mockGetById).toHaveBeenCalledWith(
        expect.any(Object),
        'id',
        userId
      );
    });

    it('should return 404 when ID does not exist', async () => {
      const userId = crypto.randomUUID();
      const { NotFoundError } = await import('../src/utils/errors.js');

      mockGetById.mockRejectedValue(new NotFoundError('User not found'));

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'GET',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/admin/users', () => {
    it('should create a new user and return 201', async () => {
      const newUser = {
        email: 'newuser@example.com',
        displayName: 'New User',
        tier: 'free',
        authProvider: 'email',
      };

      const createdUser = {
        id: crypto.randomUUID(),
        ...newUser,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockCreateRecord.mockResolvedValue(createdUser);

      const response = await app.request('/v1/admin/users', {
        method: 'POST',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        email: 'newuser@example.com',
        displayName: 'New User',
        tier: 'free',
      });
      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          email: 'newuser@example.com',
        })
      );
    });
  });

  describe('PUT /v1/admin/users/:id', () => {
    it('should update a user and return 200', async () => {
      const userId = crypto.randomUUID();
      const updateData = {
        displayName: 'Updated Name',
        tier: 'premium',
      };

      const updatedUser = {
        id: userId,
        email: 'user@example.com',
        displayName: 'Updated Name',
        tier: 'premium',
        authProvider: 'email',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      mockUpdateRecord.mockResolvedValue(updatedUser);

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: userId,
        displayName: 'Updated Name',
        tier: 'premium',
      });
      expect(mockUpdateRecord).toHaveBeenCalledWith(
        expect.any(Object),
        'id',
        userId,
        expect.objectContaining({
          displayName: 'Updated Name',
        })
      );
    });
  });

  describe('DELETE /v1/admin/users/:id', () => {
    it('should delete a user and return 200', async () => {
      const userId = crypto.randomUUID();

      mockDeleteRecord.mockResolvedValue({ deleted: true });

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        deleted: true,
      });
      expect(mockDeleteRecord).toHaveBeenCalledWith(
        expect.any(Object),
        'id',
        userId
      );
    });

    it('should return 404 for non-existent ID', async () => {
      const userId = crypto.randomUUID();
      const { NotFoundError } = await import('../src/utils/errors.js');

      mockDeleteRecord.mockRejectedValue(new NotFoundError('User not found'));

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Authentication', () => {
    it('should return 401 for GET without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/users', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 401 for POST without X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 401 for PUT without X-Admin-Secret header', async () => {
      const userId = crypto.randomUUID();

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: 'pro' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 401 for DELETE without X-Admin-Secret header', async () => {
      const userId = crypto.randomUUID();

      const response = await app.request(`/v1/admin/users/${userId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 401 for invalid X-Admin-Secret header', async () => {
      const response = await app.request('/v1/admin/users', {
        method: 'GET',
        headers: {
          'X-Admin-Secret': 'invalid-secret',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
