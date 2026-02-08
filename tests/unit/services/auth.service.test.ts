import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authService from '../../../src/services/auth.service.js';
import * as passwordUtils from '../../../src/utils/password.js';
import * as jwtUtils from '../../../src/utils/jwt.js';
import { ConflictError, InternalError } from '../../../src/utils/errors.js';
import { createMockDb } from '../../helpers/db.helper.js';
import { createTestUser } from '../../helpers/auth.helper.js';

// Mock the database module
vi.mock('../../../src/config/database.js', () => ({
  db: null, // Will be overridden in each test
}));

describe('Auth Service', () => {
  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const testUser = {
        id: crypto.randomUUID(),
        email: 'newuser@example.com',
        displayName: 'New User',
        tier: 'free',
        authProvider: 'email',
        authProviderId: null,
        avatarUrl: null,
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]), // No existing user
            }),
          }),
        }),
        insert: () => ({
          values: () => ({
            returning: () => Promise.resolve([testUser]),
          }),
        }),
      });

      // Temporarily replace the db export
      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.createUser({
        email: 'newuser@example.com',
        displayName: 'New User',
        passwordHash: 'hashed_password',
      });

      expect(result).toBeDefined();
      expect(result.email).toBe('newuser@example.com');
      expect(result.displayName).toBe('New User');
    });

    it('should throw ConflictError if email already exists', async () => {
      const existingUser = {
        id: crypto.randomUUID(),
        email: 'existing@example.com',
        displayName: 'Existing User',
        tier: 'free',
        authProvider: 'email',
        authProviderId: null,
        avatarUrl: null,
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingUser]), // User exists
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      await expect(
        authService.createUser({
          email: 'existing@example.com',
          displayName: 'New User',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw InternalError if database is not available', async () => {
      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(null as any);

      await expect(
        authService.createUser({
          email: 'test@example.com',
          displayName: 'Test User',
        })
      ).rejects.toThrow(InternalError);
    });
  });

  describe('findByEmail', () => {
    it('should return user when email exists', async () => {
      const testUser = {
        id: crypto.randomUUID(),
        email: 'found@example.com',
        displayName: 'Found User',
        tier: 'free',
        authProvider: 'email',
        authProviderId: null,
        avatarUrl: null,
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([testUser]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.findByEmail('found@example.com');

      expect(result).toBeDefined();
      expect(result?.email).toBe('found@example.com');
    });

    it('should return null when email does not exist', async () => {
      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]), // No user found
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('password hashing and comparison', () => {
    it('should hash password correctly', async () => {
      const password = 'Test1234';
      const hash = await passwordUtils.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should compare password with hash correctly', async () => {
      const password = 'Test1234';
      const hash = await passwordUtils.hashPassword(password);
      const isMatch = await passwordUtils.comparePassword(password, hash);

      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'Test1234';
      const wrongPassword = 'Wrong5678';
      const hash = await passwordUtils.hashPassword(password);
      const isMatch = await passwordUtils.comparePassword(wrongPassword, hash);

      expect(isMatch).toBe(false);
    });
  });

  describe('JWT token operations', () => {
    it('should generate access token with correct payload', () => {
      const payload = {
        sub: crypto.randomUUID(),
        email: 'test@example.com',
        tier: 'free',
      };

      const token = jwtUtils.signAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should verify and decode access token', () => {
      const payload = {
        sub: crypto.randomUUID(),
        email: 'test@example.com',
        tier: 'pro',
      };

      const token = jwtUtils.signAccessToken(payload);
      const decoded = jwtUtils.verifyAccessToken(token);

      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.tier).toBe(payload.tier);
    });

    it('should generate refresh token with expiry', () => {
      const result = jwtUtils.signRefreshToken();

      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('findByProviderId', () => {
    it('should return user when provider and provider ID match', async () => {
      const testUser = {
        id: crypto.randomUUID(),
        email: 'google@example.com',
        displayName: 'Google User',
        tier: 'free',
        authProvider: 'google',
        authProviderId: 'google123',
        avatarUrl: null,
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([testUser]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.findByProviderId('google', 'google123');

      expect(result).toBeDefined();
      expect(result?.authProvider).toBe('google');
      expect(result?.authProviderId).toBe('google123');
    });

    it('should return null when provider ID exists but provider does not match', async () => {
      const testUser = {
        id: crypto.randomUUID(),
        email: 'google@example.com',
        displayName: 'Google User',
        tier: 'free',
        authProvider: 'google',
        authProviderId: 'google123',
        avatarUrl: null,
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([testUser]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.findByProviderId('apple', 'google123');

      expect(result).toBeNull();
    });

    it('should return null when provider ID does not exist', async () => {
      const mockDb = createMockDb({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.findByProviderId('google', 'notfound');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user profile fields', async () => {
      const userId = crypto.randomUUID();
      const updatedUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Updated Name',
        tier: 'pro',
        authProvider: 'email',
        authProviderId: null,
        avatarUrl: 'https://example.com/avatar.jpg',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = createMockDb({
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([updatedUser]),
            }),
          }),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.updateUser(userId, {
        displayName: 'Updated Name',
        avatarUrl: 'https://example.com/avatar.jpg',
        tier: 'pro',
      });

      expect(result).toBeDefined();
      expect(result.displayName).toBe('Updated Name');
      expect(result.tier).toBe('pro');
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('storeRefreshToken', () => {
    it('should store hashed refresh token and return raw token', async () => {
      const userId = crypto.randomUUID();

      const mockDb = createMockDb({
        insert: () => ({
          values: () => Promise.resolve(),
        }),
      });

      const dbModule = await import('../../../src/config/database.js');
      vi.spyOn(dbModule, 'db', 'get').mockReturnValue(mockDb as any);

      const result = await authService.storeRefreshToken(userId);

      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('password validation', () => {
    it('should accept valid password', () => {
      const result = passwordUtils.validatePasswordStrength('Test1234');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password with less than 8 characters', () => {
      const result = passwordUtils.validatePasswordStrength('Test12');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', () => {
      const result = passwordUtils.validatePasswordStrength('test1234');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without number', () => {
      const result = passwordUtils.validatePasswordStrength('TestTest');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });
  });
});
