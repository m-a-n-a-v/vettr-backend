/**
 * Standardized API response types
 * All API responses follow this format for consistency
 */

export interface ResponseMeta {
  timestamp: string;
  request_id: string;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ResponseMeta;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedData<T = unknown> {
  items: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface PaginatedResponse<T = unknown> {
  success: true;
  data: PaginatedData<T>;
  meta: ResponseMeta;
}
