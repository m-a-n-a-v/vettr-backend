import { Hono } from 'hono';
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
      'VETTR Backend API - A comprehensive REST API for stock analysis, VETR Score calculation, Red Flag detection, and portfolio management for iOS and Android mobile clients.\n\n' +
      '## Authentication\n\n' +
      'Most endpoints require JWT authentication via Bearer token in Authorization header:\n' +
      '```\nAuthorization: Bearer <access_token>\n```\n\n' +
      'Access tokens are obtained from `/auth/login`, `/auth/signup`, `/auth/google`, or `/auth/apple` endpoints.\n\n' +
      '## Rate Limiting\n\n' +
      'API requests are rate-limited based on subscription tier:\n\n' +
      '| Tier | Read Requests | Write Requests |\n' +
      '|------|---------------|----------------|\n' +
      '| Unauthenticated | 5/min | N/A |\n' +
      '| FREE | 60/min | 30/min |\n' +
      '| PRO | 120/min | 60/min |\n' +
      '| PREMIUM | 300/min | 120/min |\n\n' +
      'Auth endpoints: 10 req/min (authenticated), 5 req/min (unauthenticated)\n\n' +
      '**Rate limit headers:**\n' +
      '- `X-RateLimit-Limit`: Maximum requests allowed in time window\n' +
      '- `X-RateLimit-Remaining`: Requests remaining in current window\n' +
      '- `X-RateLimit-Reset`: Unix timestamp when limit resets\n' +
      '- `Retry-After`: Seconds to wait before retrying (included when rate limited)\n\n' +
      '## Tier Limits\n\n' +
      'Feature access is restricted by subscription tier:\n\n' +
      '| Feature | FREE | PRO | PREMIUM |\n' +
      '|---------|------|-----|----------|\n' +
      '| Watchlist items | 5 | 25 | Unlimited |\n' +
      '| Sync interval | 24h | 12h | 4h |\n' +
      '| Pulse delay | 12h | 4h | Real-time |\n\n' +
      '## Error Response Format\n\n' +
      'All errors follow a standardized JSON format:\n' +
      '```json\n' +
      '{\n' +
      '  "success": false,\n' +
      '  "error": {\n' +
      '    "code": "ERROR_CODE",\n' +
      '    "message": "Human-readable error message",\n' +
      '    "details": {} // Optional additional details\n' +
      '  },\n' +
      '  "meta": {\n' +
      '    "timestamp": "2024-01-01T00:00:00.000Z",\n' +
      '    "request_id": "uuid"\n' +
      '  }\n' +
      '}\n```\n\n' +
      '**Error Codes:**\n\n' +
      '- `AUTH_REQUIRED` (401): Authorization header missing or invalid\n' +
      '- `AUTH_EXPIRED` (401): Access token has expired, use refresh token\n' +
      '- `AUTH_INVALID_CREDENTIALS` (401): Invalid email or password\n' +
      '- `FORBIDDEN` (403): Authenticated but not authorized for this resource\n' +
      '- `TIER_LIMIT_EXCEEDED` (403): Subscription tier limit reached (e.g., watchlist full)\n' +
      '- `NOT_FOUND` (404): Requested resource does not exist\n' +
      '- `CONFLICT` (409): Resource conflict (e.g., duplicate email on signup)\n' +
      '- `VALIDATION_ERROR` (422): Request validation failed, see `details` for field errors\n' +
      '- `RATE_LIMITED` (429): Rate limit exceeded, see `Retry-After` header\n' +
      '- `INTERNAL_ERROR` (500): Unexpected server error\n\n' +
      '**Example Error Responses:**\n\n' +
      '```json\n// 401 AUTH_REQUIRED\n' +
      '{\n' +
      '  "success": false,\n' +
      '  "error": {\n' +
      '    "code": "AUTH_REQUIRED",\n' +
      '    "message": "Authorization header is required"\n' +
      '  }\n' +
      '}\n```\n\n' +
      '```json\n// 422 VALIDATION_ERROR\n' +
      '{\n' +
      '  "success": false,\n' +
      '  "error": {\n' +
      '    "code": "VALIDATION_ERROR",\n' +
      '    "message": "Validation failed",\n' +
      '    "details": {\n' +
      '      "email": "Invalid email format",\n' +
      '      "password": "Password must be at least 8 characters"\n' +
      '    }\n' +
      '  }\n' +
      '}\n```\n\n' +
      '```json\n// 403 TIER_LIMIT_EXCEEDED\n' +
      '{\n' +
      '  "success": false,\n' +
      '  "error": {\n' +
      '    "code": "TIER_LIMIT_EXCEEDED",\n' +
      '    "message": "Watchlist limit exceeded for FREE tier (max 5 items)"\n' +
      '  }\n' +
      '}\n```',
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
    { name: 'admin', description: 'Admin metrics and monitoring (requires X-Admin-Secret)' },
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
// Supports comma-separated origins (e.g., 'http://localhost:5173,http://localhost:3000')
// or wildcard '*' for all origins
const corsOrigin = (() => {
  if (env.CORS_ORIGIN === '*') {
    return '*';
  }

  const allowedOrigins = env.CORS_ORIGIN.split(',').map(origin => origin.trim());

  return (origin: string) => {
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    return allowedOrigins[0]; // Fallback to first origin
  };
})();

app.use(
  '*',
  cors({
    origin: corsOrigin,
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
export default app;
