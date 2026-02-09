import { Hono } from 'hono';
import { db } from '../config/database.js';
import { redis, upstashRedis, redisMode } from '../config/redis.js';
import { sql } from 'drizzle-orm';

const healthRoutes = new Hono();

// Store server start time for uptime calculation
const startTime = Date.now();

healthRoutes.get('/', async (c) => {
  const now = Date.now();
  const uptimeMs = now - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);

  // Check database connectivity
  let dbStatus = 'unavailable';
  let dbError: string | undefined;

  if (db) {
    try {
      // Simple query to verify connection
      await db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
      dbError = error instanceof Error ? error.message : 'Unknown database error';
    }
  }

  // Check Redis connectivity
  let redisStatus = 'unavailable';
  let redisError: string | undefined;

  if (redisMode === 'ioredis' && redis) {
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch (error) {
      redisStatus = 'error';
      redisError = error instanceof Error ? error.message : 'Unknown Redis error';
    }
  } else if (redisMode === 'upstash' && upstashRedis) {
    try {
      await upstashRedis.ping();
      redisStatus = 'connected';
    } catch (error) {
      redisStatus = 'error';
      redisError = error instanceof Error ? error.message : 'Unknown Redis error';
    }
  }

  // Determine overall health status
  const isHealthy = dbStatus === 'connected';
  const status = isHealthy ? 'healthy' : 'degraded';

  return c.json({
    success: true,
    data: {
      status,
      version: '1.0.0',
      uptime: uptimeSeconds,
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        error: dbError,
      },
      redis: {
        status: redisStatus,
        error: redisError,
      },
    },
  });
});

export { healthRoutes };
