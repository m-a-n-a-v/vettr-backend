import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, index } from 'drizzle-orm/pg-core';

export const cronJobRuns = pgTable('cron_job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: varchar('job_name', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'running', 'completed', 'failed'
  stocksProcessed: integer('stocks_processed').default(0),
  succeeded: integer('succeeded').default(0),
  failedCount: integer('failed_count').default(0),
  failures: jsonb('failures'), // Array of { ticker: string, error: string }
  chunkOffset: integer('chunk_offset'),
  chunkSize: integer('chunk_size'),
  totalStocks: integer('total_stocks'),
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
}, (table) => ({
  jobNameIdx: index('cron_job_runs_job_name_idx').on(table.jobName),
  startedAtIdx: index('cron_job_runs_started_at_idx').on(table.startedAt),
}));
