/**
 * Custom error classes for standardized error handling across the API
 */

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'TIER_LIMIT_EXCEEDED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: unknown,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly (TypeScript requirement)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class AuthRequiredError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, 401, 'AUTH_REQUIRED', details);
    Object.setPrototypeOf(this, AuthRequiredError.prototype);
  }
}

/**
 * 401 Unauthorized - Token expired
 */
export class AuthExpiredError extends AppError {
  constructor(message = 'Token has expired', details?: unknown) {
    super(message, 401, 'AUTH_EXPIRED', details);
    Object.setPrototypeOf(this, AuthExpiredError.prototype);
  }
}

/**
 * 401 Unauthorized - Invalid credentials
 */
export class AuthInvalidCredentialsError extends AppError {
  constructor(message = 'Invalid credentials', details?: unknown) {
    super(message, 401, 'AUTH_INVALID_CREDENTIALS', details);
    Object.setPrototypeOf(this, AuthInvalidCredentialsError.prototype);
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details?: unknown) {
    super(message, 429, 'RATE_LIMITED', details);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * 403 Forbidden - Tier limit exceeded
 */
export class TierLimitError extends AppError {
  constructor(message = 'Tier limit exceeded', details?: unknown) {
    super(message, 403, 'TIER_LIMIT_EXCEEDED', details);
    Object.setPrototypeOf(this, TierLimitError.prototype);
  }
}

/**
 * 409 Conflict - Resource conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(message, 500, 'INTERNAL_ERROR', details, false);
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}
