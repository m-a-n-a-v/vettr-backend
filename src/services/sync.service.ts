import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, filings, alertRules, syncHistory } from '../db/schema/index.js';
import { InternalError, ForbiddenError } from '../utils/errors.js';

// Tier-based sync frequency limits (in hours)
const SYNC_FREQUENCY_LIMITS = {
  free: 24,      // FREE: 24h sync interval
  pro: 12,       // PRO: 12h sync interval
  premium: 4,    // PREMIUM: 4h sync interval
} as const;

export type EntityType = 'stocks' | 'filings' | 'alert_rules';

export interface PullChangesParams {
  userId: string;
  lastSyncedAt: Date | string;
  entities: EntityType[];
  userTier: string;
}

export interface PullChangesResult {
  sync_token: string;
  synced_at: string;
  changes: {
    stocks?: {
      updated: any[];
      deleted: string[];
    };
    filings?: {
      updated: any[];
      deleted: string[];
    };
    alert_rules?: {
      updated: any[];
      deleted: string[];
    };
  };
}

/**
 * Pull changes since last sync timestamp
 * Enforces tier-based sync frequency limits
 */
export async function pullChanges(params: PullChangesParams): Promise<PullChangesResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const { userId, lastSyncedAt, entities, userTier } = params;

  // Convert lastSyncedAt to Date if it's a string
  const lastSyncDate = typeof lastSyncedAt === 'string' ? new Date(lastSyncedAt) : lastSyncedAt;

  // Enforce tier-based sync frequency limit
  await enforceSyncFrequencyLimit(userId, userTier);

  // Current timestamp for this sync
  const syncedAt = new Date();
  const syncToken = crypto.randomUUID();

  // Initialize changes object
  const changes: PullChangesResult['changes'] = {};

  // Create sync history record
  const syncRecord = await db
    .insert(syncHistory)
    .values({
      userId,
      startedAt: syncedAt,
      status: 'pending',
      itemsSynced: 0,
    })
    .returning();

  const syncId = syncRecord[0]!.id;
  let totalItemsSynced = 0;

  try {
    // Pull stocks changes if requested
    if (entities.includes('stocks')) {
      const updatedStocks = await db
        .select()
        .from(stocks)
        .where(gte(stocks.updatedAt, lastSyncDate));

      changes.stocks = {
        updated: updatedStocks.map(stock => ({
          id: stock.id,
          ticker: stock.ticker,
          name: stock.name,
          exchange: stock.exchange,
          sector: stock.sector,
          market_cap: stock.marketCap,
          price: stock.price,
          price_change: stock.priceChange,
          vetr_score: stock.vetrScore,
          updated_at: stock.updatedAt.toISOString(),
        })),
        deleted: [], // For now, stocks are not soft-deleted
      };
      totalItemsSynced += updatedStocks.length;
    }

    // Pull filings changes if requested
    if (entities.includes('filings')) {
      const updatedFilings = await db
        .select({
          filing: filings,
          stock: stocks,
        })
        .from(filings)
        .innerJoin(stocks, eq(filings.stockId, stocks.id))
        .where(gte(filings.createdAt, lastSyncDate));

      changes.filings = {
        updated: updatedFilings.map(({ filing, stock }) => ({
          id: filing.id,
          stock_id: filing.stockId,
          stock_ticker: stock.ticker,
          type: filing.type,
          title: filing.title,
          date: filing.date.toISOString(),
          summary: filing.summary,
          is_material: filing.isMaterial,
          source_url: filing.sourceUrl,
          created_at: filing.createdAt.toISOString(),
        })),
        deleted: [], // For now, filings are not soft-deleted
      };
      totalItemsSynced += updatedFilings.length;
    }

    // Pull alert_rules changes if requested
    if (entities.includes('alert_rules')) {
      const updatedRules = await db
        .select()
        .from(alertRules)
        .where(
          and(
            eq(alertRules.userId, userId),
            gte(alertRules.createdAt, lastSyncDate)
          )
        );

      changes.alert_rules = {
        updated: updatedRules.map(rule => ({
          id: rule.id,
          user_id: rule.userId,
          stock_ticker: rule.stockTicker,
          rule_type: rule.ruleType,
          trigger_conditions: rule.triggerConditions,
          condition_operator: rule.conditionOperator,
          frequency: rule.frequency,
          threshold: rule.threshold,
          is_active: rule.isActive,
          created_at: rule.createdAt.toISOString(),
          last_triggered_at: rule.lastTriggeredAt?.toISOString() ?? null,
        })),
        deleted: [], // For now, alert_rules are not soft-deleted
      };
      totalItemsSynced += updatedRules.length;
    }

    // Update sync history record as successful
    await db
      .update(syncHistory)
      .set({
        completedAt: syncedAt,
        status: 'success',
        itemsSynced: totalItemsSynced,
      })
      .where(eq(syncHistory.id, syncId));

    return {
      sync_token: syncToken,
      synced_at: syncedAt.toISOString(),
      changes,
    };
  } catch (error) {
    // Update sync history record as failed
    await db
      .update(syncHistory)
      .set({
        completedAt: syncedAt,
        status: 'failed',
        errors: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(syncHistory.id, syncId));

    throw error;
  }
}

/**
 * Enforce tier-based sync frequency limit
 * Throws ForbiddenError if sync attempt is too soon
 */
async function enforceSyncFrequencyLimit(userId: string, userTier: string): Promise<void> {
  if (!db) {
    return; // Skip check if database not available
  }

  // Get the most recent successful sync for this user
  const recentSyncs = await db
    .select()
    .from(syncHistory)
    .where(
      and(
        eq(syncHistory.userId, userId),
        eq(syncHistory.status, 'success')
      )
    )
    .orderBy(sql`${syncHistory.startedAt} DESC`)
    .limit(1);

  if (recentSyncs.length === 0) {
    // No previous sync, allow this one
    return;
  }

  const lastSync = recentSyncs[0]!;
  const lastSyncTime = lastSync.startedAt.getTime();
  const currentTime = Date.now();
  const hoursSinceLastSync = (currentTime - lastSyncTime) / (1000 * 60 * 60);

  // Determine tier limit
  const tierLower = userTier.toLowerCase() as keyof typeof SYNC_FREQUENCY_LIMITS;
  const frequencyLimit = SYNC_FREQUENCY_LIMITS[tierLower] ?? SYNC_FREQUENCY_LIMITS.free;

  // Check if sync attempt is too soon
  if (hoursSinceLastSync < frequencyLimit) {
    const hoursRemaining = Math.ceil(frequencyLimit - hoursSinceLastSync);
    throw new ForbiddenError(
      `Sync frequency limit exceeded for ${userTier.toUpperCase()} tier. Please wait ${hoursRemaining} hour(s) before syncing again.`,
      {
        tier: userTier,
        frequency_limit_hours: frequencyLimit,
        hours_since_last_sync: Math.floor(hoursSinceLastSync * 10) / 10,
        hours_remaining: hoursRemaining,
        last_sync_at: lastSync.startedAt.toISOString(),
      }
    );
  }
}

/**
 * Get sync history for a user
 */
export async function getSyncHistory(userId: string, limit = 20, offset = 0) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const results = await db
    .select()
    .from(syncHistory)
    .where(eq(syncHistory.userId, userId))
    .orderBy(sql`${syncHistory.startedAt} DESC`)
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncHistory)
    .where(eq(syncHistory.userId, userId));

  const total = countResult[0]?.count ?? 0;

  return {
    items: results.map(sync => ({
      id: sync.id,
      user_id: sync.userId,
      started_at: sync.startedAt.toISOString(),
      completed_at: sync.completedAt?.toISOString() ?? null,
      items_synced: sync.itemsSynced,
      status: sync.status,
      errors: sync.errors,
    })),
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    },
  };
}

export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncChange {
  entity: EntityType;
  action: SyncAction;
  data: any;
  timestamp: string | Date;
  id?: string; // For update/delete actions
}

export interface ConflictItem {
  entity: EntityType;
  id: string;
  action: SyncAction;
  local_timestamp: string;
  server_timestamp: string;
  local_data: any;
  server_data: any;
  reason: string;
}

export interface PushChangesResult {
  applied: SyncChange[];
  conflicts: ConflictItem[];
  sync_token: string;
  synced_at: string;
}

/**
 * Push local changes to server with conflict detection
 * Detects conflicts when both client and server modified the same entity after last sync
 */
export async function pushChanges(
  userId: string,
  changes: SyncChange[]
): Promise<PushChangesResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const appliedChanges: SyncChange[] = [];
  const conflicts: ConflictItem[] = [];
  const syncedAt = new Date();
  const syncToken = crypto.randomUUID();

  // Process each change
  for (const change of changes) {
    const changeTimestamp = typeof change.timestamp === 'string'
      ? new Date(change.timestamp)
      : change.timestamp;

    try {
      if (change.entity === 'alert_rules') {
        // Alert rules are user-specific and can be modified
        const result = await processAlertRuleChange(userId, change, changeTimestamp);

        if (result.conflict) {
          conflicts.push(result.conflict);
        } else if (result.applied) {
          appliedChanges.push(change);
        }
      } else if (change.entity === 'stocks' || change.entity === 'filings') {
        // Stocks and filings are read-only for clients (server-authoritative)
        // Any client modifications are conflicts
        conflicts.push({
          entity: change.entity,
          id: change.id ?? change.data?.id ?? 'unknown',
          action: change.action,
          local_timestamp: changeTimestamp.toISOString(),
          server_timestamp: syncedAt.toISOString(),
          local_data: change.data,
          server_data: null,
          reason: `${change.entity} are read-only and cannot be modified by clients`,
        });
      }
    } catch (error) {
      // If processing fails, treat as a conflict
      conflicts.push({
        entity: change.entity,
        id: change.id ?? change.data?.id ?? 'unknown',
        action: change.action,
        local_timestamp: changeTimestamp.toISOString(),
        server_timestamp: syncedAt.toISOString(),
        local_data: change.data,
        server_data: null,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    applied: appliedChanges,
    conflicts,
    sync_token: syncToken,
    synced_at: syncedAt.toISOString(),
  };
}

interface ProcessChangeResult {
  applied?: boolean;
  conflict?: ConflictItem;
}

/**
 * Process alert rule changes (create/update/delete)
 * Detects conflicts when rule was modified on server after client's last sync
 */
async function processAlertRuleChange(
  userId: string,
  change: SyncChange,
  changeTimestamp: Date
): Promise<ProcessChangeResult> {
  if (!db) {
    return { applied: false };
  }

  const { action, data, id } = change;

  if (action === 'create') {
    // Create new alert rule
    try {
      await db.insert(alertRules).values({
        userId,
        stockTicker: data.stock_ticker,
        ruleType: data.rule_type,
        triggerConditions: data.trigger_conditions,
        conditionOperator: data.condition_operator ?? 'AND',
        frequency: data.frequency ?? 'instant',
        threshold: data.threshold,
        isActive: data.is_active ?? true,
      });
      return { applied: true };
    } catch (error: any) {
      // Duplicate or constraint violation
      return {
        conflict: {
          entity: 'alert_rules',
          id: data.id ?? 'unknown',
          action: 'create',
          local_timestamp: changeTimestamp.toISOString(),
          server_timestamp: new Date().toISOString(),
          local_data: data,
          server_data: null,
          reason: error.message ?? 'Failed to create alert rule',
        },
      };
    }
  }

  if (action === 'update' && id) {
    // Check if rule exists and hasn't been modified since client's timestamp
    const existing = await db
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.id, id),
          eq(alertRules.userId, userId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return {
        conflict: {
          entity: 'alert_rules',
          id,
          action: 'update',
          local_timestamp: changeTimestamp.toISOString(),
          server_timestamp: new Date().toISOString(),
          local_data: data,
          server_data: null,
          reason: 'Alert rule not found or was deleted',
        },
      };
    }

    const serverRule = existing[0]!;

    // Check for conflict: server rule was modified after client's change timestamp
    // For simplicity, we'll use createdAt as a proxy for last modified
    // In a real system, you'd have an updatedAt field
    if (serverRule.createdAt > changeTimestamp) {
      return {
        conflict: {
          entity: 'alert_rules',
          id,
          action: 'update',
          local_timestamp: changeTimestamp.toISOString(),
          server_timestamp: serverRule.createdAt.toISOString(),
          local_data: data,
          server_data: {
            stock_ticker: serverRule.stockTicker,
            rule_type: serverRule.ruleType,
            trigger_conditions: serverRule.triggerConditions,
            is_active: serverRule.isActive,
          },
          reason: 'Alert rule was modified on server after client change',
        },
      };
    }

    // No conflict, apply the update
    await db
      .update(alertRules)
      .set({
        stockTicker: data.stock_ticker ?? serverRule.stockTicker,
        ruleType: data.rule_type ?? serverRule.ruleType,
        triggerConditions: data.trigger_conditions ?? serverRule.triggerConditions,
        conditionOperator: data.condition_operator ?? serverRule.conditionOperator,
        frequency: data.frequency ?? serverRule.frequency,
        threshold: data.threshold ?? serverRule.threshold,
        isActive: data.is_active ?? serverRule.isActive,
      })
      .where(eq(alertRules.id, id));

    return { applied: true };
  }

  if (action === 'delete' && id) {
    // Check if rule exists
    const existing = await db
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.id, id),
          eq(alertRules.userId, userId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      // Already deleted or never existed - not necessarily a conflict
      return { applied: true };
    }

    const serverRule = existing[0]!;

    // Check for conflict: server rule was modified after client's delete timestamp
    if (serverRule.createdAt > changeTimestamp) {
      return {
        conflict: {
          entity: 'alert_rules',
          id,
          action: 'delete',
          local_timestamp: changeTimestamp.toISOString(),
          server_timestamp: serverRule.createdAt.toISOString(),
          local_data: data,
          server_data: {
            stock_ticker: serverRule.stockTicker,
            rule_type: serverRule.ruleType,
            is_active: serverRule.isActive,
          },
          reason: 'Alert rule was modified on server after client delete',
        },
      };
    }

    // No conflict, delete the rule
    await db
      .delete(alertRules)
      .where(eq(alertRules.id, id));

    return { applied: true };
  }

  return { applied: false };
}
