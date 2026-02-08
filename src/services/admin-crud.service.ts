/**
 * Generic admin CRUD service for managing database tables
 * Provides reusable list, get, create, update, and delete operations
 */

import { db } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { eq, ilike, or, asc, desc, SQL, and } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PaginationMeta } from '../types/pagination.js';

/**
 * Configuration for table operations
 */
export interface TableConfig {
  searchableColumns?: string[];
  filterableColumns?: string[];
  sortableColumns?: string[];
}

/**
 * Pagination and filtering parameters
 */
export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
  sort?: string;
  filters?: Record<string, string>;
}

/**
 * Paginated list result
 */
export interface ListResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Generic CRUD service for admin operations
 */
export class AdminCrudService {
  /**
   * List records with pagination, search, sort, and filters
   */
  async listRecords<T>(
    table: PgTable,
    config: TableConfig,
    params: ListParams = {}
  ): Promise<ListResult<T>> {
    const {
      limit = 25,
      offset = 0,
      search,
      sort = 'createdAt:desc',
      filters = {},
    } = params;

    if (!db) {
      throw new Error('Database connection not available');
    }

    // Build WHERE conditions
    const conditions: SQL[] = [];

    // Add search conditions
    if (search && config.searchableColumns && config.searchableColumns.length > 0) {
      const searchConditions = config.searchableColumns.map((col) =>
        ilike(table[col as keyof typeof table] as any, `%${search}%`)
      );
      conditions.push(or(...searchConditions)!);
    }

    // Add filter conditions
    if (config.filterableColumns) {
      for (const [key, value] of Object.entries(filters)) {
        if (config.filterableColumns.includes(key) && value !== undefined && value !== '') {
          conditions.push(eq(table[key as keyof typeof table] as any, value));
        }
      }
    }

    // Parse sort parameter
    const [sortColumn, sortDirection] = sort.split(':');
    const isValidSort =
      config.sortableColumns?.includes(sortColumn) &&
      (sortDirection === 'asc' || sortDirection === 'desc');

    // Build query
    let query = db.select().from(table);

    // Apply WHERE conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }

    // Apply sort
    if (isValidSort) {
      const sortFn = sortDirection === 'asc' ? asc : desc;
      query = query.orderBy(sortFn(table[sortColumn as keyof typeof table] as any)) as any;
    }

    // Apply pagination
    query = query.limit(limit).offset(offset) as any;

    // Execute query
    const items = (await query) as T[];

    // Get total count
    let countQuery = db.select().from(table);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)!) as any;
    }
    const allItems = await countQuery;
    const total = allItems.length;

    // Build pagination metadata
    const pagination: PaginationMeta = {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    };

    return { items, pagination };
  }

  /**
   * Get a single record by primary key
   */
  async getById<T>(
    table: PgTable,
    primaryKey: string,
    id: string
  ): Promise<T> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const result = await db
      .select()
      .from(table)
      .where(eq(table[primaryKey as keyof typeof table] as any, id))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Record not found');
    }

    return result[0] as T;
  }

  /**
   * Create a new record
   */
  async createRecord<T>(
    table: PgTable,
    data: Record<string, any>
  ): Promise<T> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const result = await db.insert(table).values(data).returning();

    return result[0] as T;
  }

  /**
   * Update a record by primary key
   */
  async updateRecord<T>(
    table: PgTable,
    primaryKey: string,
    id: string,
    data: Record<string, any>
  ): Promise<T> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    // First check if the record exists
    await this.getById(table, primaryKey, id);

    // Update the record
    const result = await db
      .update(table)
      .set(data)
      .where(eq(table[primaryKey as keyof typeof table] as any, id))
      .returning();

    return result[0] as T;
  }

  /**
   * Delete a record by primary key
   */
  async deleteRecord(
    table: PgTable,
    primaryKey: string,
    id: string
  ): Promise<{ deleted: boolean }> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    // First check if the record exists
    await this.getById(table, primaryKey, id);

    // Delete the record
    await db
      .delete(table)
      .where(eq(table[primaryKey as keyof typeof table] as any, id));

    return { deleted: true };
  }
}
