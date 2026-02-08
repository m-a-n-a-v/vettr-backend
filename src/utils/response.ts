/**
 * Standardized API response builders
 * All API responses should use these helpers for consistency
 */

import { randomUUID } from 'crypto';
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginatedResponse,
  ResponseMeta,
} from '../types/api.js';
import type { PaginationMeta } from '../types/pagination.js';

/**
 * Generate response metadata with timestamp and request ID
 */
function generateMeta(): ResponseMeta {
  return {
    timestamp: new Date().toISOString(),
    request_id: randomUUID(),
  };
}

/**
 * Build a successful API response
 * @param data - The response data
 * @returns Standardized success response
 */
export function success<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: generateMeta(),
  };
}

/**
 * Build an error API response
 * @param code - Error code (e.g., "AUTH_REQUIRED", "NOT_FOUND")
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @returns Standardized error response
 */
export function error(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: generateMeta(),
  };
}

/**
 * Build a paginated API response
 * @param items - Array of items for the current page
 * @param pagination - Pagination metadata
 * @returns Standardized paginated response
 */
export function paginated<T>(
  items: T[],
  pagination: PaginationMeta
): PaginatedResponse<T> {
  return {
    success: true,
    data: {
      items,
      pagination,
    },
    meta: generateMeta(),
  };
}
