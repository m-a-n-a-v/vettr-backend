import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  pullChanges,
  pushChanges,
  resolveConflicts,
  type EntityType,
  type SyncChange,
  type ConflictResolution,
} from '../services/sync.service.js';
import { success } from '../utils/response.js';
import { z } from 'zod';

type Variables = {
  user: AuthUser;
};

const syncRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all sync routes
syncRoutes.use('*', authMiddleware);

// Zod schemas for request validation
const pullRequestSchema = z.object({
  last_synced_at: z.string().datetime(),
  entities: z.array(z.enum(['stocks', 'filings', 'alert_rules'])),
});

const pushRequestSchema = z.object({
  changes: z.array(z.object({
    entity: z.enum(['stocks', 'filings', 'alert_rules']),
    action: z.enum(['create', 'update', 'delete']),
    data: z.any(),
    timestamp: z.string().datetime(),
    id: z.string().uuid().optional(),
  })),
});

const resolveRequestSchema = z.object({
  resolutions: z.array(z.object({
    entity: z.enum(['stocks', 'filings', 'alert_rules']),
    id: z.string().uuid(),
    strategy: z.enum(['local_wins', 'server_wins', 'last_write_wins']),
    local_data: z.any().optional(),
    server_data: z.any().optional(),
    local_timestamp: z.string().datetime().optional(),
    server_timestamp: z.string().datetime().optional(),
  })),
});

// POST /sync/pull - Pull changes since last sync timestamp
syncRoutes.post('/pull', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Validate request body
  const validationResult = pullRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validationResult.error.errors,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: crypto.randomUUID(),
        },
      },
      422
    );
  }

  const { last_synced_at, entities } = validationResult.data;

  const result = await pullChanges({
    userId: user.id,
    lastSyncedAt: last_synced_at,
    entities: entities as EntityType[],
    userTier: user.tier,
  });

  return c.json(success(result), 200);
});

// POST /sync/push - Push local changes, detect and return conflicts
syncRoutes.post('/push', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Validate request body
  const validationResult = pushRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validationResult.error.errors,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: crypto.randomUUID(),
        },
      },
      422
    );
  }

  const { changes } = validationResult.data;

  const result = await pushChanges(user.id, changes as SyncChange[]);

  return c.json(success(result), 200);
});

// POST /sync/resolve - Resolve detected conflicts with chosen strategies
syncRoutes.post('/resolve', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Validate request body
  const validationResult = resolveRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validationResult.error.errors,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: crypto.randomUUID(),
        },
      },
      422
    );
  }

  const { resolutions } = validationResult.data;

  const result = await resolveConflicts(user.id, resolutions as ConflictResolution[]);

  return c.json(success(result), 200);
});

export { syncRoutes };
