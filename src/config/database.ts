import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeonWs } from 'drizzle-orm/neon-serverless';
import { Pool as NeonPool } from '@neondatabase/serverless';
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

/**
 * Drizzle database instance for PostgreSQL.
 *
 * Supports two modes:
 * - Local/TCP: Uses standard `pg` driver (for Docker Postgres or any TCP connection)
 * - Serverless (Vercel): Uses @neondatabase/serverless WebSocket pool driver
 *
 * Mode is auto-detected based on DATABASE_URL:
 * - If URL contains "neon.tech" → use Neon serverless WebSocket driver
 * - Otherwise → use standard pg TCP driver
 */

let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzleNeonWs> | null = null;

try {
  if (env.DATABASE_URL) {
    const isNeon = env.DATABASE_URL.includes('neon.tech');

    if (isNeon) {
      // Neon serverless WebSocket driver (full SQL compatibility for Vercel)
      const neonPool = new NeonPool({ connectionString: env.DATABASE_URL });
      db = drizzleNeonWs(neonPool);
      console.log('✅ Database connection established (Neon serverless WebSocket)');
    } else {
      // Standard pg TCP driver (for local Docker or any TCP Postgres)
      const pool = new Pool({
        connectionString: env.DATABASE_URL,
      });
      db = drizzle(pool);
      console.log('✅ Database connection established (PostgreSQL TCP)');
    }
  } else {
    console.warn('⚠️  DATABASE_URL not configured - database features disabled');
  }
} catch (error) {
  console.error('❌ Failed to initialize database connection:', error);

  if (env.NODE_ENV === 'production') {
    console.error('💥 Cannot start application without database in production mode');
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing in development mode without database');
  }
}

export { db };
