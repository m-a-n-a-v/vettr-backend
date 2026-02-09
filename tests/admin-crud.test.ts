import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';
import * as adminCrudService from '../src/services/admin-crud.service.js';

/**
 * Integration tests for admin CRUD endpoints.
 * These tests verify the generic admin CRUD functionality for managing database tables.
 */

// Mock the admin CRUD service
vi.mock('../src/services/admin-crud.service.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/admin-crud.service.js')>(
    '../src/services/admin-crud.service.js'
  );
  return {
    ...actual,
    AdminCrudService: vi.fn().mockImplementation(() => ({
      listRecords: vi.fn(),
      getById: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
    })),
  };
});

describe('Admin CRUD Endpoints Integration Tests', () => {
  const ADMIN_SECRET = 'test-admin-secret';
  let mockService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set admin secret for testing
    process.env.ADMIN_SECRET = ADMIN_SECRET;

    // Get the mocked service instance
    const AdminCrudServiceMock = vi.mocked(adminCrudService.AdminCrudService);
    mockService = new AdminCrudServiceMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ADMIN_SECRET;
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

      mockService.listRecords.mockResolvedValue({
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

      mockService.listRecords.mockResolvedValue({
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
      expect(mockService.listRecords).toHaveBeenCalledWith(
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

      mockService.listRecords.mockResolvedValue({
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
      expect(mockService.listRecords).toHaveBeenCalledWith(
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

      mockService.listRecords.mockResolvedValue({
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
      expect(mockService.listRecords).toHaveBeenCalledWith(
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

      mockService.getById.mockResolvedValue(mockUser);

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
        display_name: 'Test User',
        tier: 'pro',
      });
      expect(mockService.getById).toHaveBeenCalledWith(
        expect.any(Object),
        'id',
        userId
      );
    });

    it('should return 404 when ID does not exist', async () => {
      const userId = crypto.randomUUID();
      const { NotFoundError } = await import('../src/utils/errors.js');

      mockService.getById.mockRejectedValue(new NotFoundError('User not found'));

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

      mockService.createRecord.mockResolvedValue(createdUser);

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
        display_name: 'New User',
        tier: 'free',
      });
      expect(mockService.createRecord).toHaveBeenCalledWith(
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

      mockService.updateRecord.mockResolvedValue(updatedUser);

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
        display_name: 'Updated Name',
        tier: 'premium',
      });
      expect(mockService.updateRecord).toHaveBeenCalledWith(
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

      mockService.deleteRecord.mockResolvedValue({ deleted: true });

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
      expect(mockService.deleteRecord).toHaveBeenCalledWith(
        expect.any(Object),
        'id',
        userId
      );
    });

    it('should return 404 for non-existent ID', async () => {
      const userId = crypto.randomUUID();
      const { NotFoundError } = await import('../src/utils/errors.js');

      mockService.deleteRecord.mockRejectedValue(new NotFoundError('User not found'));

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
