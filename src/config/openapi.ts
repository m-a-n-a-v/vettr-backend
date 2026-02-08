import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

/**
 * OpenAPI Configuration
 * Defines the base OpenAPI specification for the VETTR API
 */

// Create OpenAPI-enabled Hono instance
export function createOpenAPIApp() {
  const app = new OpenAPIHono();

  // Configure OpenAPI documentation
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'VETTR API',
      version: '1.0.0',
      description: 'VETTR Backend API - A comprehensive REST API for stock analysis, VETR Score calculation, Red Flag detection, and portfolio management for iOS and Android mobile clients.',
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

  return app;
}

// Standard error response schema for OpenAPI documentation
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  meta: z.object({
    timestamp: z.string(),
    request_id: z.string(),
  }),
});
