import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error-handler.js';

const app = new Hono().basePath('/v1');

// Middleware
app.use('*', logger());
app.use('*', cors());

// Global error handler
app.onError(errorHandler);

// Health check
app.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  });
});

export { app };
