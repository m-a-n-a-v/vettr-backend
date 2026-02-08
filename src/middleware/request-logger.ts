import type { MiddlewareHandler } from 'hono';
import type { AuthUser } from './auth.js';

// Define context variables type
type Variables = {
  requestId: string;
  user?: AuthUser;
};

/**
 * Request timing and structured JSON logging middleware
 * Logs every request with timing information in JSON format
 * Warns on slow requests (>500ms)
 */
export const requestLogger: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const start = Date.now();
  const requestId = c.get('requestId');

  await next();

  const duration = Date.now() - start;
  const { method, url } = c.req;
  const status = c.res.status;

  // Parse URL to get clean path without query params for logging
  const urlObj = new URL(url);
  const path = urlObj.pathname;

  // Structured log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    request_id: requestId,
    method,
    path,
    status,
    duration_ms: duration,
  };

  // Log level based on status code and duration
  if (status >= 500) {
    // Server errors
    console.error(JSON.stringify(logEntry));
  } else if (status >= 400) {
    // Client errors
    console.warn(JSON.stringify(logEntry));
  } else if (duration > 500) {
    // Slow requests (>500ms)
    console.warn(JSON.stringify({ ...logEntry, warning: 'slow_request' }));
  } else {
    // Normal requests
    console.log(JSON.stringify(logEntry));
  }
};
