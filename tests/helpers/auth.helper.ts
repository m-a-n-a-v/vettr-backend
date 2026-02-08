import { signAccessToken, signRefreshToken } from '../../src/utils/jwt.js';
import type { AccessTokenPayload } from '../../src/utils/jwt.js';

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  tier: 'free' | 'pro' | 'premium';
  passwordHash?: string;
  authProvider: string;
}

/**
 * Create a test user object with default values.
 * Does not persist to database - for use in mocked contexts.
 */
export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  return {
    id: crypto.randomUUID(),
    email: `test-${Date.now()}@example.com`,
    displayName: 'Test User',
    tier: 'free',
    authProvider: 'email',
    ...overrides,
  };
}

/**
 * Create a valid access token for a test user.
 * Token is properly signed and can be verified with JWT utilities.
 */
export function createTestToken(user: Pick<TestUser, 'id' | 'email' | 'tier'>): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    tier: user.tier,
  };
  return signAccessToken(payload);
}

/**
 * Create a valid refresh token for testing.
 * Returns both the raw token and its expiry date.
 */
export function createTestRefreshToken(): { token: string; expiresAt: Date } {
  return signRefreshToken();
}

/**
 * Create an Authorization header value with Bearer token.
 * Use this in test requests that require authentication.
 */
export function createAuthHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Create a test user with all tiers for testing tier-based features.
 */
export const TEST_USERS = {
  free: createTestUser({ tier: 'free', email: 'free@example.com' }),
  pro: createTestUser({ tier: 'pro', email: 'pro@example.com' }),
  premium: createTestUser({ tier: 'premium', email: 'premium@example.com' }),
} as const;

/**
 * Create test tokens for all tier levels.
 */
export const TEST_TOKENS = {
  free: createTestToken(TEST_USERS.free),
  pro: createTestToken(TEST_USERS.pro),
  premium: createTestToken(TEST_USERS.premium),
} as const;
