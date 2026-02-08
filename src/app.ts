import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error-handler.js';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.routes.js';

// Define context variables type
type Variables = {
  requestId: string;
};

const app = new Hono<{ Variables: Variables }>().basePath('/v1');

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

// Register routes
app.route('/health', healthRoutes);

export { app };
