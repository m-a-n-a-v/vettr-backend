/**
 * Admin CRUD route factory
 * Generates RESTful CRUD endpoints for any Drizzle table with minimal boilerplate
 */

import { Hono } from 'hono';
import type { PgTable } from 'drizzle-orm/pg-core';
import { AdminCrudService } from '../services/admin-crud.service.js';
import { success, paginated } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Configuration for creating CRUD routes
 */
export interface CrudRouteConfig {
  tableName: string;
  table: PgTable;
  primaryKey: string;
  searchableColumns?: string[];
  filterableColumns?: string[];
  sortableColumns?: string[];
}

/**
 * Validates query parameters for list endpoint
 */
function validateListParams(query: Record<string, string | undefined>) {
  const limit = query.limit ? parseInt(query.limit, 10) : 25;
  const offset = query.offset ? parseInt(query.offset, 10) : 0;

  if (isNaN(limit) || limit <= 0 || limit > 100) {
    throw new ValidationError('Limit must be a positive integer between 1 and 100');
  }

  if (isNaN(offset) || offset < 0) {
    throw new ValidationError('Offset must be a non-negative integer');
  }

  // Validate sort format if provided
  if (query.sort) {
    const sortPattern = /^[a-zA-Z_]+:(asc|desc)$/;
    if (!sortPattern.test(query.sort)) {
      throw new ValidationError('Sort must match format column:(asc|desc)');
    }
  }

  return { limit, offset };
}

/**
 * Extract filter parameters from query string
 * Filters are prefixed with filter_*
 */
function extractFilters(query: Record<string, string | undefined>): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('filter_') && value !== undefined && value !== '') {
      const filterKey = key.substring(7); // Remove 'filter_' prefix
      filters[filterKey] = value;
    }
  }

  return filters;
}

/**
 * Creates a Hono router with CRUD endpoints for the specified table
 * @param config - Table configuration including name, table reference, and searchable/filterable columns
 * @returns Hono router instance with all CRUD routes
 */
export function createAdminCrudRoutes(config: CrudRouteConfig): Hono {
  const router = new Hono();
  const crudService = new AdminCrudService();

  /**
   * GET /
   * List records with pagination, search, sort, and filters
   */
  router.get('/', async (c) => {
    const query = c.req.query();

    // Validate query params
    const { limit, offset } = validateListParams(query);

    // Extract filters
    const filters = extractFilters(query);

    // Build list params
    const params = {
      limit,
      offset,
      search: query.search,
      sort: query.sort,
      filters,
    };

    // Fetch records
    const result = await crudService.listRecords(
      config.table,
      {
        searchableColumns: config.searchableColumns,
        filterableColumns: config.filterableColumns,
        sortableColumns: config.sortableColumns,
      },
      params
    );

    return c.json(paginated(result.items, result.pagination));
  });

  /**
   * GET /:id
   * Get a single record by ID
   */
  router.get('/:id', async (c) => {
    const id = c.req.param('id');

    const record = await crudService.getById(
      config.table,
      config.primaryKey,
      id
    );

    return c.json(success(record));
  });

  /**
   * POST /
   * Create a new record
   */
  router.post('/', async (c) => {
    const body = await c.req.json();

    const record = await crudService.createRecord(
      config.table,
      body
    );

    return c.json(success(record), 201);
  });

  /**
   * PUT /:id
   * Update an existing record
   */
  router.put('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const record = await crudService.updateRecord(
      config.table,
      config.primaryKey,
      id,
      body
    );

    return c.json(success(record));
  });

  /**
   * DELETE /:id
   * Delete a record
   */
  router.delete('/:id', async (c) => {
    const id = c.req.param('id');

    const result = await crudService.deleteRecord(
      config.table,
      config.primaryKey,
      id
    );

    return c.json(success(result));
  });

  return router;
}
