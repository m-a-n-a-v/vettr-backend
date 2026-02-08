import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import * as authService from '../../src/services/auth.service.js';
import { hashPassword } from '../../src/utils/password.js';
import { createTestUser } from '../helpers/auth.helper.js';

/**
 * Integration tests for auth endpoints.
 * These tests verify the full authentication flow including signup, login, refresh, and logout.
 */

// Mock the auth service functions
vi.mock('../../src/services/auth.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/auth.service.js')>(
    '../../src/services/auth.service.js'
  );
  return {
    ...actual,
    createUser: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    storeRefreshToken: vi.fn(),
    findAndVerifyRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    verifyGoogleToken: vi.fn(),
    verifyAppleToken: vi.fn(),
    upsertOAuthUser: vi.fn(),
  };
});

// Mock the password utilities
vi.mock('../../src/utils/password.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/password.js')>(
    '../../src/utils/password.js'
  );
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('hashed_password_123'),
    comparePassword: vi.fn(),
  };
});

describe('Auth Endpoints Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /v1/auth/signup', () => {
    it('should create a new user and return tokens', async () => {
      const testUser = createTestUser({
        email: 'newuser@example.com',
        displayName: 'New User',
        tier: 'free',
      });

      const fullUser = {
        ...testUser,
        passwordHash: 'hashed_password_123',
        authProviderId: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(authService.createUser).mockResolvedValue(fullUser);
      vi.mocked(authService.storeRefreshToken).mockResolvedValue({
        token: 'refresh_token_abc123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const response = await app.request('/v1/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'StrongPass123',
          display_name: 'New User',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('access_token');
      expect(data.data).toHaveProperty('refresh_token');
      expect(data.data.token_type).toBe('Bearer');
      expect(data.data.expires_in).toBe(900);
      expect(data.data.user).toMatchObject({
        email: 'newuser@example.com',
        display_name: 'New User',
        tier: 'free',
      });
      expect(authService.createUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        displayName: 'New User',
        passwordHash: 'hashed_password_123',
        authProvider: 'email',
      });
    });

    it('should reject weak passwords', async () => {
      const response = await app.request('/v1/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'weak',
          display_name: 'New User',
        }),
      });

      expect(response.status).toBe(422);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(authService.createUser).not.toHaveBeenCalled();
    });

    it('should reject invalid email format', async () => {
      const response = await app.request('/v1/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'StrongPass123',
          display_name: 'New User',
        }),
      });

      expect(response.status).toBe(422);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate email', async () => {
      const { ConflictError } = await import('../../src/utils/errors.js');
      vi.mocked(authService.createUser).mockRejectedValue(
        new ConflictError('User with this email already exists')
      );

      const response = await app.request('/v1/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'StrongPass123',
          display_name: 'New User',
        }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /v1/auth/login', () => {
    it('should authenticate user with valid credentials', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'free',
      });

      const fullUser = {
        ...testUser,
        passwordHash: 'hashed_password_123',
        authProviderId: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(authService.findByEmail).mockResolvedValue(fullUser);
      vi.mocked(authService.storeRefreshToken).mockResolvedValue({
        token: 'refresh_token_abc123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const { comparePassword } = await import('../../src/utils/password.js');
      vi.mocked(comparePassword).mockResolvedValue(true);

      const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'CorrectPassword123',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('access_token');
      expect(data.data).toHaveProperty('refresh_token');
      expect(data.data.user.email).toBe('user@example.com');
    });

    it('should reject invalid email', async () => {
      vi.mocked(authService.findByEmail).mockResolvedValue(null);

      const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'SomePassword123',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject invalid password', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
      });

      const fullUser = {
        ...testUser,
        passwordHash: 'hashed_password_123',
        authProviderId: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(authService.findByEmail).mockResolvedValue(fullUser);

      const { comparePassword } = await import('../../src/utils/password.js');
      vi.mocked(comparePassword).mockResolvedValue(false);

      const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'WrongPassword123',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject OAuth-only accounts without password', async () => {
      const testUser = createTestUser({
        email: 'oauth@example.com',
        authProvider: 'google',
      });

      const fullUser = {
        ...testUser,
        passwordHash: null, // OAuth-only account
        authProviderId: 'google_123',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(authService.findByEmail).mockResolvedValue(fullUser);

      const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'oauth@example.com',
          password: 'SomePassword123',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });
  });

  describe('POST /v1/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
        tier: 'pro',
      });

      const fullUser = {
        ...testUser,
        passwordHash: 'hashed_password_123',
        authProviderId: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tokenRow = {
        id: crypto.randomUUID(),
        userId: testUser.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date(),
      };

      vi.mocked(authService.findAndVerifyRefreshToken).mockResolvedValue({
        tokenRow,
        userId: testUser.id,
      });
      vi.mocked(authService.findById).mockResolvedValue(fullUser);
      vi.mocked(authService.revokeRefreshToken).mockResolvedValue();
      vi.mocked(authService.storeRefreshToken).mockResolvedValue({
        token: 'new_refresh_token_xyz',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const response = await app.request('/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: 'old_refresh_token_abc',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('access_token');
      expect(data.data.refresh_token).toBe('new_refresh_token_xyz');
      expect(authService.revokeRefreshToken).toHaveBeenCalledWith(tokenRow.id);
      expect(authService.storeRefreshToken).toHaveBeenCalledWith(testUser.id);
    });

    it('should reject invalid refresh token', async () => {
      vi.mocked(authService.findAndVerifyRefreshToken).mockResolvedValue(null);

      const response = await app.request('/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: 'invalid_token',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject expired refresh token', async () => {
      vi.mocked(authService.findAndVerifyRefreshToken).mockResolvedValue(null);

      const response = await app.request('/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: 'expired_token',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should revoke refresh token successfully', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
      });

      const tokenRow = {
        id: crypto.randomUUID(),
        userId: testUser.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date(),
      };

      vi.mocked(authService.findAndVerifyRefreshToken).mockResolvedValue({
        tokenRow,
        userId: testUser.id,
      });
      vi.mocked(authService.revokeRefreshToken).mockResolvedValue();

      // Create a valid access token for authentication
      const { signAccessToken } = await import('../../src/utils/jwt.js');
      const accessToken = signAccessToken({
        sub: testUser.id,
        email: testUser.email,
        tier: testUser.tier,
      });

      const response = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          refresh_token: 'valid_refresh_token',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(authService.revokeRefreshToken).toHaveBeenCalledWith(tokenRow.id);
    });

    it('should return success even for invalid token to prevent enumeration', async () => {
      const testUser = createTestUser({
        email: 'user@example.com',
      });

      vi.mocked(authService.findAndVerifyRefreshToken).mockResolvedValue(null);

      // Create a valid access token for authentication
      const { signAccessToken } = await import('../../src/utils/jwt.js');
      const accessToken = signAccessToken({
        sub: testUser.id,
        email: testUser.email,
        tier: testUser.tier,
      });

      const response = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          refresh_token: 'invalid_token',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(authService.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const response = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: 'some_token',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Protected endpoint authentication', () => {
    it('should reject requests without token', async () => {
      const response = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: 'some_token',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should reject requests with invalid token format', async () => {
      const response = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'InvalidFormat token123',
        },
        body: JSON.stringify({
          refresh_token: 'some_token',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('AUTH_REQUIRED');
    });

    it('should reject requests with malformed JWT', async () => {
      const response = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer not.a.valid.jwt',
        },
        body: JSON.stringify({
          refresh_token: 'some_token',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();

      expect(data.success).toBe(false);
    });
  });
});
