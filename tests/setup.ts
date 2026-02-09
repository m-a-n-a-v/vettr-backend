import { beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Global test setup for all test suites.
 * Runs before all tests to prepare the test environment.
 */
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.PORT = '3001';

  // Disable Redis and Database for unit tests by default
  // Individual tests can override these if they need real connections
  process.env.REDIS_URL = '';
  process.env.DATABASE_URL = '';

  console.log('✅ Test environment initialized');
});

/**
 * Global test teardown.
 * Runs after all tests complete.
 */
afterAll(async () => {
  console.log('✅ Test environment cleaned up');
});

/**
 * Reset mocks before each test.
 */
beforeEach(() => {
  // Clear any module mocks or caches if needed
  // This ensures each test starts with a clean slate
});
