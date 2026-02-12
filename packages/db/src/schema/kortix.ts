import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Schema ──────────────────────────────────────────────────────────────────
export const kortixSchema = pgSchema('kortix');

// ─── Enums ───────────────────────────────────────────────────────────────────
export const sandboxStatusEnum = kortixSchema.enum('sandbox_status', [
  'provisioning',
  'active',
  'stopped',
  'archived',
  'pooled',
  'error',
]);

export const executionStatusEnum = kortixSchema.enum('execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'skipped',
]);

export const sessionModeEnum = kortixSchema.enum('session_mode', [
  'new',
  'reuse',
]);

// ─── Sandboxes ───────────────────────────────────────────────────────────────
export const sandboxes = kortixSchema.table(
  'sandboxes',
  {
    sandboxId: uuid('sandbox_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    externalId: text('external_id'),
    status: sandboxStatusEnum('status').default('provisioning').notNull(),
    baseUrl: text('base_url').notNull(),
    authToken: text('auth_token'),
    config: jsonb('config').default({}).$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    pooledAt: timestamp('pooled_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sandboxes_account').on(table.accountId),
    index('idx_sandboxes_external_id').on(table.externalId),
    index('idx_sandboxes_status').on(table.status),
    index('idx_sandboxes_pooled_fifo').on(table.pooledAt),
    index('idx_sandboxes_auth_token').on(table.authToken),
  ],
);

// ─── Triggers ────────────────────────────────────────────────────────────────
export const triggers = kortixSchema.table(
  'triggers',
  {
    triggerId: uuid('trigger_id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    cronExpr: varchar('cron_expr', { length: 100 }).notNull(),
    timezone: varchar('timezone', { length: 50 }).default('UTC').notNull(),
    agentName: varchar('agent_name', { length: 255 }),
    prompt: text('prompt').notNull(),
    sessionMode: sessionModeEnum('session_mode').default('new').notNull(),
    sessionId: text('session_id'),
    isActive: boolean('is_active').default(true).notNull(),
    maxRetries: integer('max_retries').default(0).notNull(),
    timeoutMs: integer('timeout_ms').default(300000).notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_triggers_next_run').on(table.nextRunAt),
    index('idx_triggers_sandbox').on(table.sandboxId),
    index('idx_triggers_account').on(table.accountId),
    index('idx_triggers_active').on(table.isActive),
  ],
);

// ─── Executions ──────────────────────────────────────────────────────────────
export const executions = kortixSchema.table(
  'executions',
  {
    executionId: uuid('execution_id').defaultRandom().primaryKey(),
    triggerId: uuid('trigger_id')
      .notNull()
      .references(() => triggers.triggerId, { onDelete: 'cascade' }),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    status: executionStatusEnum('status').default('pending').notNull(),
    sessionId: text('session_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0).notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_executions_trigger').on(table.triggerId),
    index('idx_executions_status').on(table.status),
    index('idx_executions_created').on(table.createdAt),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────
export const sandboxesRelations = relations(sandboxes, ({ many }) => ({
  triggers: many(triggers),
  executions: many(executions),
}));

export const triggersRelations = relations(triggers, ({ one, many }) => ({
  sandbox: one(sandboxes, {
    fields: [triggers.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  executions: many(executions),
}));

export const executionsRelations = relations(executions, ({ one }) => ({
  trigger: one(triggers, {
    fields: [executions.triggerId],
    references: [triggers.triggerId],
  }),
  sandbox: one(sandboxes, {
    fields: [executions.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));
