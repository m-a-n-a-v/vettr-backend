/**
 * Zod-based request validation middleware for Hono
 * Validates request body, query parameters, and route parameters
 */

import type { Context, MiddlewareHandler } from 'hono';
import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Validation target - which part of the request to validate
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Creates a validation middleware for a specific part of the request
 *
 * @param target - Which part of the request to validate (body, query, or params)
 * @param schema - Zod schema to validate against
 * @returns Hono middleware handler
 *
 * @example
 * // Validate request body
 * app.post('/users', zValidator('body', z.object({ email: z.string().email() })), async (c) => {
 *   const body = await c.req.json();
 *   // body is now validated and typed
 * });
 *
 * @example
 * // Validate query parameters
 * app.get('/users', zValidator('query', z.object({ limit: z.string().optional() })), async (c) => {
 *   const query = c.req.query();
 *   // query is now validated
 * });
 */
export function zValidator<T extends ZodSchema>(
  target: ValidationTarget,
  schema: T
): MiddlewareHandler {
  return async (c: Context, next) => {
    let data: unknown;

    try {
      // Extract data based on target
      switch (target) {
        case 'body':
          data = await c.req.json();
          break;
        case 'query':
          data = c.req.query();
          break;
        case 'params':
          data = c.req.param();
          break;
        default:
          throw new Error(`Invalid validation target: ${target}`);
      }

      // Validate data against schema
      const result = schema.safeParse(data);

      if (!result.success) {
        // Extract validation errors in a readable format
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));

        throw new ValidationError('Request validation failed', {
          target,
          issues,
        });
      }

      // Validation passed, continue to next middleware/handler
      await next();
    } catch (err) {
      // If it's already a ValidationError, just throw it
      if (err instanceof ValidationError) {
        throw err;
      }

      // If it's a ZodError (shouldn't happen with safeParse, but just in case)
      if (err instanceof ZodError) {
        const issues = err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));

        throw new ValidationError('Request validation failed', {
          target,
          issues,
        });
      }

      // For JSON parsing errors (invalid JSON body)
      if (err instanceof SyntaxError && target === 'body') {
        throw new ValidationError('Invalid JSON in request body', {
          target,
          message: err.message,
        });
      }

      // Re-throw any other errors
      throw err;
    }
  };
}

/**
 * Convenience function for validating request body
 */
export function validateBody<T extends ZodSchema>(schema: T): MiddlewareHandler {
  return zValidator('body', schema);
}

/**
 * Convenience function for validating query parameters
 */
export function validateQuery<T extends ZodSchema>(schema: T): MiddlewareHandler {
  return zValidator('query', schema);
}

/**
 * Convenience function for validating route parameters
 */
export function validateParams<T extends ZodSchema>(schema: T): MiddlewareHandler {
  return zValidator('params', schema);
}
