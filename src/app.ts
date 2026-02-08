import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono().basePath('/v1');

// Middleware
app.use('*', logger());
app.use('*', cors());

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
