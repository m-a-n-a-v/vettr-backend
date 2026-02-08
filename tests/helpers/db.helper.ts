/**
 * Database test helpers for mocking database interactions.
 *
 * For unit tests, we typically mock the database entirely to avoid
 * external dependencies. For integration tests, we may use a real
 * test database or in-memory database.
 */

/**
 * Mock database query result.
 * Use this to simulate database responses in unit tests.
 */
export function mockDbResult<T>(data: T[]): T[] {
  return data;
}

/**
 * Mock single row result.
 */
export function mockDbSingleResult<T>(data: T | null): T | null {
  return data;
}

/**
 * Mock database error.
 * Use this to simulate database failures in tests.
 */
export function mockDbError(message: string): Error {
  return new Error(`Database error: ${message}`);
}

/**
 * Create a mock Drizzle database client.
 * This is useful for unit testing services without a real database.
 *
 * @example
 * const mockDb = createMockDb({
 *   select: () => ({
 *     from: () => ({
 *       where: () => Promise.resolve([{ id: '1', name: 'Test' }])
 *     })
 *   })
 * });
 */
export function createMockDb(overrides: Record<string, any> = {}): any {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
        limit: () => Promise.resolve([]),
        offset: () => Promise.resolve([]),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve({ rowCount: 0 }),
    }),
    ...overrides,
  };
}

/**
 * Reset database state between tests.
 * For in-memory or test databases, this can clear all tables.
 */
export async function resetDatabase(): Promise<void> {
  // In a real implementation, this would:
  // - Truncate all tables
  // - Reset sequences
  // - Clear cache
  // For now, this is a placeholder for future implementation
  console.log('Database reset (mock implementation)');
}

/**
 * Seed test data into the database.
 * Use this to set up specific test scenarios.
 */
export async function seedTestData<T>(table: string, data: T[]): Promise<void> {
  console.log(`Seeding ${data.length} rows into ${table} (mock implementation)`);
}
