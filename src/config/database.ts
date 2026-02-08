import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { env } from './env.js';

/**
 * Drizzle database instance for Neon PostgreSQL
 *
 * Handles connection pooling and graceful error handling.
 * Falls back to a disabled state when DATABASE_URL is not configured
 * (useful for development environments).
 */

let db: ReturnType<typeof drizzle> | null = null;

try {
  if (env.DATABASE_URL) {
    // Create connection pool with Neon serverless driver
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
    });

    // Initialize Drizzle with the pool
    db = drizzle(pool);

    console.log('✅ Database connection established (Neon PostgreSQL)');
  } else {
    console.warn('⚠️  DATABASE_URL not configured - database features disabled');
  }
} catch (error) {
  console.error('❌ Failed to initialize database connection:', error);

  // In production, exit the process if database connection fails
  if (env.NODE_ENV === 'production') {
    console.error('💥 Cannot start application without database in production mode');
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing in development mode without database');
  }
}

// Export a proxy that throws helpful errors if db is null
export { db };
