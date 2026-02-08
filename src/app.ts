import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { stockRoutes } from './routes/stocks.routes.js';
import type { AuthUser } from './middleware/auth.js';

// Define context variables type
type Variables = {
  requestId: string;
  user: AuthUser;
};

const app = new OpenAPIHono<{ Variables: Variables }>().basePath('/v1');

// Configure OpenAPI documentation
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'VETTR API',
    version: '1.0.0',
    description:
      'VETTR Backend API - A comprehensive REST API for stock analysis, VETR Score calculation, Red Flag detection, and portfolio management for iOS and Android mobile clients.',
  },
  servers: [
    {
      url: '/v1',
      description: 'API v1',
    },
  ],
  tags: [
    { name: 'health', description: 'Health check endpoints' },
    { name: 'auth', description: 'Authentication and authorization' },
    { name: 'stocks', description: 'Stock data and search' },
    { name: 'filings', description: 'Regulatory filings' },
    { name: 'executives', description: 'Executive team information' },
    { name: 'vetr-score', description: 'VETR Score calculation and history' },
    { name: 'red-flags', description: 'Red Flag detection and analysis' },
    { name: 'alerts', description: 'Alert rules and notifications' },
    { name: 'watchlist', description: 'User watchlist management' },
    { name: 'sync', description: 'Offline sync operations' },
    { name: 'users', description: 'User profile and settings' },
  ],
});

// Swagger UI documentation endpoint
app.get('/docs', swaggerUI({ url: '/v1/openapi.json' }));

// Request ID middleware - adds unique request_id to context
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// Logger middleware
app.use('*', logger());

// CORS middleware - configurable via environment variable
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// Global error handler
app.onError(errorHandler);

// Tier-based rate limiting middleware
// Applied globally - auto-detects read/write from HTTP method
// Auth routes have their own stricter auth-specific rate limiting
// Gracefully skips when Redis is unavailable (dev mode)
app.use('*', rateLimitMiddleware);

// Register routes
app.route('/health', healthRoutes);
app.route('/auth', authRoutes);
app.route('/stocks', stockRoutes);

export { app };
