/**
 * Global error handler middleware for Hono
 * Catches all errors and returns standardized error responses
 */

import type { Context } from 'hono';
import { AppError } from '../utils/errors.js';
import { error } from '../utils/response.js';

/**
 * Global error handler middleware
 * Transforms all errors into standardized API error responses
 */
export async function errorHandler(err: Error, c: Context) {
  // Log error for debugging
  console.error('❌ Error caught by error handler:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  // Handle custom AppError instances
  if (err instanceof AppError) {
    return c.json(
      error(err.code, err.message, err.details as Record<string, unknown>),
      err.statusCode as any
    );
  }

  // Handle Zod validation errors (if thrown directly)
  if (err.name === 'ZodError') {
    const zodError = err as any;
    return c.json(
      error('VALIDATION_ERROR', 'Request validation failed', {
        issues: zodError.issues || [],
      }),
      422 as any
    );
  }

  // Handle generic HTTP errors (if any)
  if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
    return c.json(
      error(
        'INTERNAL_ERROR',
        err.message || 'An unexpected error occurred',
        undefined
      ),
      (err as any).statusCode as any
    );
  }

  // Handle all other unexpected errors
  // Don't leak sensitive error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorDetails = isDevelopment
    ? {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
    : undefined;

  return c.json(
    error('INTERNAL_ERROR', 'An unexpected error occurred', errorDetails),
    500 as any
  );
}
