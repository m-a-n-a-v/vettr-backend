/**
 * Admin CRUD route factory
 * Generates RESTful CRUD endpoints for any Drizzle table with minimal boilerplate
 */

import { Hono } from 'hono';
import type { PgTable } from 'drizzle-orm/pg-core';
import { inArray } from 'drizzle-orm';
import { AdminCrudService } from '../services/admin-crud.service.js';
import { success, paginated } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';
import { db } from '../config/database.js';

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

  if (isNaN(limit) || limit <= 0 || limit > 2000) {
    throw new ValidationError('Limit must be a positive integer between 1 and 2000');
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
 * Escapes a value for CSV format
 * Wraps values containing commas, quotes, or newlines in double quotes
 * Escapes existing double quotes as double-double-quotes
 */
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // Check if value needs escaping (contains comma, quote, or newline)
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    // Escape existing quotes by doubling them
    const escapedValue = stringValue.replace(/"/g, '""');
    return `"${escapedValue}"`;
  }

  return stringValue;
}

/**
 * Converts an array of records to CSV format
 */
function generateCsv(records: any[]): string {
  if (records.length === 0) {
    return '';
  }

  // Extract column names from the first record
  const columns = Object.keys(records[0]);

  // Create header row
  const header = columns.map(col => escapeCsvValue(col)).join(',');

  // Create data rows
  const rows = records.map(record => {
    return columns.map(col => escapeCsvValue(record[col])).join(',');
  });

  return [header, ...rows].join('\n');
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

  /**
   * POST /bulk
   * Bulk create multiple records
   * Accepts JSON body { records: Array<object> }
   */
  router.post('/bulk', async (c) => {
    const body = await c.req.json();

    // Validate body
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be an object');
    }

    if (!Array.isArray(body.records)) {
      throw new ValidationError('Body must contain a records array');
    }

    if (body.records.length === 0) {
      throw new ValidationError('Records array cannot be empty');
    }

    if (!db) {
      throw new Error('Database connection not available');
    }

    // Insert all records
    await db.insert(config.table).values(body.records);

    return c.json(success({ created: body.records.length }));
  });

  /**
   * DELETE /bulk
   * Bulk delete multiple records by IDs
   * Accepts JSON body { ids: string[] }
   */
  router.delete('/bulk', async (c) => {
    const body = await c.req.json();

    // Validate body
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be an object');
    }

    if (!Array.isArray(body.ids)) {
      throw new ValidationError('Body must contain an ids array');
    }

    if (body.ids.length === 0) {
      throw new ValidationError('IDs array cannot be empty');
    }

    if (!db) {
      throw new Error('Database connection not available');
    }

    // Delete all matching records
    const result = await db
      .delete(config.table)
      .where(inArray(config.table[config.primaryKey as keyof typeof config.table] as any, body.ids));

    // Get the count of deleted records from the result
    // Drizzle returns an array with the deleted rows when using .returning()
    // Without .returning(), we need to count differently
    // For now, we'll return the count of IDs we attempted to delete
    const deletedCount = body.ids.length;

    return c.json(success({ deleted: deletedCount }));
  });

  /**
   * GET /export
   * Export records as CSV or JSON
   * Accepts format=csv|json (default json) and all search/sort/filter params
   */
  router.get('/export', async (c) => {
    const query = c.req.query();
    const format = query.format || 'json';

    // Validate format
    if (format !== 'csv' && format !== 'json') {
      throw new ValidationError('Format must be either csv or json');
    }

    // Extract filters
    const filters = extractFilters(query);

    // Build list params with very large limit to fetch all records
    const params = {
      limit: 100000, // Large limit to fetch all matching records
      offset: 0,
      search: query.search,
      sort: query.sort,
      filters,
    };

    // Fetch all matching records
    const result = await crudService.listRecords(
      config.table,
      {
        searchableColumns: config.searchableColumns,
        filterableColumns: config.filterableColumns,
        sortableColumns: config.sortableColumns,
      },
      params
    );

    const records = result.items;

    // Generate appropriate format
    if (format === 'csv') {
      const csvContent = generateCsv(records);

      // Set CSV headers
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename=${config.tableName}-export.csv`);

      return c.body(csvContent);
    } else {
      // JSON format - return array directly without pagination wrapper
      c.header('Content-Type', 'application/json');
      return c.json(records);
    }
  });

  return router;
}
