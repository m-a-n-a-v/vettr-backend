/**
 * Input sanitization utilities to prevent XSS attacks
 */

/**
 * Sanitizes a string by removing HTML tags and dangerous characters
 * @param input - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove HTML tags (handles <script>, <img>, etc.)
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Remove potential script event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:/gi, '');

  return sanitized.trim();
}

/**
 * Sanitizes an object recursively, handling nested objects and arrays
 * @param input - The object to sanitize
 * @returns The sanitized object
 */
export function sanitizeObject<T>(input: T): T {
  if (typeof input === 'string') {
    return sanitizeString(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item)) as T;
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        sanitized[key] = sanitizeObject(input[key]);
      }
    }
    return sanitized as T;
  }

  return input;
}

/**
 * Sanitizes user input from request body
 * Useful for signup, profile updates, etc.
 * @param body - The request body to sanitize
 * @returns The sanitized body
 */
export function sanitizeRequestBody<T extends Record<string, unknown>>(
  body: T
): T {
  return sanitizeObject(body);
}
