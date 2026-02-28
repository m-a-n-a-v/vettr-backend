import { Hono } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { metricsTracker } from './middleware/metrics-tracker.js';
import { env } from './config/env.js';
import { openApiSpec } from './config/openapi-spec.js';
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
  discoveryRoutes,
  waitlistRoutes,
  pulseRoutes,
  cronRoutes,
  fundamentalsRoutes,
  aiAgentRoutes,
  portfolioRoutes,
  newsRoutes,
  portfolioAlertsRoutes,
  portfolioInsightsRoutes,
  publicRoutes,
  samplePortfolioRoutes,
  deviceRoutes,
} from './routes/index.js';
import type { AuthUser } from './middleware/auth.js';

// Define context variables type
type Variables = {
  requestId: string;
  user: AuthUser;
};

const app = new OpenAPIHono<{ Variables: Variables }>().basePath('/v1');

// CORS middleware - must be registered BEFORE any route handlers (including app.doc)
// Configurable via environment variable
// Supports comma-separated origins (e.g., 'http://localhost:5173,http://localhost:3000')
// or wildcard '*' for all origins
const corsOrigin = (() => {
  if (env.CORS_ORIGIN === '*') {
    // Reflect the requesting origin so credentials: true is valid
    return (origin: string) => origin || '*';
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
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  })
);

// Serve static OpenAPI spec (comprehensive, manually-maintained)
app.get('/openapi.json', (c) => c.json(openApiSpec));

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

// Response compression (gzip/deflate)
app.use('*', compress());

// Request body size limit (1MB)
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));

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
app.route('/stocks', fundamentalsRoutes);
app.route('/red-flags', redFlagGlobalRoutes);
app.route('/filings', filingRoutes);
app.route('/executives', executiveRoutes);
app.route('/users', userRoutes);
app.route('/subscription', subscriptionRoutes);
app.route('/alerts', alertRoutes);
app.route('/watchlist', watchlistRoutes);
app.route('/sync', syncRoutes);
app.route('/discovery', discoveryRoutes);
app.route('/admin', adminRoutes);
app.route('/waitlist', waitlistRoutes);
app.route('/pulse', pulseRoutes);
app.route('/cron', cronRoutes);
app.route('/ai-agent', aiAgentRoutes);

// Portfolio pivot routes
app.route('/portfolio', portfolioRoutes);
app.route('/news', newsRoutes);
app.route('/portfolio-alerts', portfolioAlertsRoutes);
app.route('/portfolio-insights', portfolioInsightsRoutes);
app.route('/public', publicRoutes);
app.route('/sample-portfolios', samplePortfolioRoutes);
app.route('/devices', deviceRoutes);

export { app };
export default app;
