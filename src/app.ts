import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { metricsTracker } from './middleware/metrics-tracker.js';
import { env } from './config/env.js';
import {
  healthRoutes,
  authRoutes,
  stockRoutes,
  filingRoutes,
  executiveRoutes,
  userRoutes,
  subscriptionRoutes,
  vetrScoreRoutes,
  redFlagStockRoutes,
  redFlagGlobalRoutes,
  alertRoutes,
  watchlistRoutes,
  syncRoutes,
  adminRoutes,
} from './routes/index.js';
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
    { name: 'subscription', description: 'Subscription tier and limits' },
  ],
});

// Swagger UI documentation endpoint
app.get('/docs', swaggerUI({ url: '/v1/openapi.json' }));

// Request ID middleware - adds unique request_id to context
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// Structured request timing logger
app.use('*', requestLogger);

// Metrics tracking (tracks requests and response times)
app.use('*', metricsTracker);

// Security headers middleware
// Adds X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, and more
app.use('*', secureHeaders());

// Request body size limit (1MB)
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));

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
app.route('/stocks', vetrScoreRoutes);
app.route('/stocks', redFlagStockRoutes);
app.route('/red-flags', redFlagGlobalRoutes);
app.route('/filings', filingRoutes);
app.route('/executives', executiveRoutes);
app.route('/users', userRoutes);
app.route('/subscription', subscriptionRoutes);
app.route('/alerts', alertRoutes);
app.route('/watchlist', watchlistRoutes);
app.route('/sync', syncRoutes);
app.route('/admin', adminRoutes);

export { app };
