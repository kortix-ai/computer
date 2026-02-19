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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const kortixSchema = pgSchema('kortix');

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

export const sandboxProviderEnum = kortixSchema.enum('sandbox_provider', [
  'daytona',
  'local_docker',
]);

export const deploymentStatusEnum = kortixSchema.enum('deployment_status', [
  'pending',
  'building',
  'deploying',
  'active',
  'failed',
  'stopped',
]);

export const deploymentSourceEnum = kortixSchema.enum('deployment_source', [
  'git',
  'code',
  'files',
  'tar',
]);

export const channelTypeEnum = kortixSchema.enum('channel_type', [
  'telegram',
  'slack',
  'discord',
  'whatsapp',
  'teams',
  'voice',
  'email',
  'sms',
]);

export const sessionStrategyEnum = kortixSchema.enum('session_strategy', [
  'single',
  'per-thread',
  'per-user',
  'per-message',
]);

export const apiKeyStatusEnum = kortixSchema.enum('api_key_status', [
  'active',
  'revoked',
  'expired',
]);

export const integrationStatusEnum = kortixSchema.enum('integration_status', [
  'active',
  'revoked',
  'expired',
  'error',
]);

export interface ChannelCredentials {
  [key: string]: unknown;
}

export interface ChannelPlatformConfig {
  groups?: { enabled?: boolean; allowList?: string[]; [key: string]: unknown };
  dm?: { enabled?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ChannelPlatformUser {
  id: string;
  name: string;
  avatar?: string;
}

export const sandboxes = kortixSchema.table(
  'sandboxes',
  {
    sandboxId: uuid('sandbox_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    provider: sandboxProviderEnum('provider').default('daytona').notNull(),
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
    modelProviderId: varchar('model_provider_id', { length: 255 }),
    modelId: varchar('model_id', { length: 255 }),
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

export const deployments = kortixSchema.table(
  'deployments',
  {
    deploymentId: uuid('deployment_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    sandboxId: uuid('sandbox_id').references(() => sandboxes.sandboxId, { onDelete: 'set null' }),
    freestyleId: text('freestyle_id'),
    status: deploymentStatusEnum('status').default('pending').notNull(),

    // Source
    sourceType: deploymentSourceEnum('source_type').notNull(),
    sourceRef: text('source_ref'),
    framework: varchar('framework', { length: 50 }),

    // Config
    domains: jsonb('domains').default([]).$type<string[]>(),
    liveUrl: text('live_url'),
    envVars: jsonb('env_vars').default({}).$type<Record<string, string>>(),
    buildConfig: jsonb('build_config').$type<Record<string, unknown>>(),
    entrypoint: text('entrypoint'),

    // Metadata
    error: text('error'),
    version: integer('version').default(1).notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_deployments_account').on(table.accountId),
    index('idx_deployments_sandbox').on(table.sandboxId),
    index('idx_deployments_status').on(table.status),
    index('idx_deployments_live_url').on(table.liveUrl),
    index('idx_deployments_created').on(table.createdAt),
  ],
);

export const channelConfigs = kortixSchema.table(
  'channel_configs',
  {
    channelConfigId: uuid('channel_config_id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .references(() => sandboxes.sandboxId, { onDelete: 'set null' }),
    accountId: uuid('account_id').notNull(),
    channelType: channelTypeEnum('channel_type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    credentials: jsonb('credentials').default({}).$type<ChannelCredentials>(),
    platformConfig: jsonb('platform_config').default({}).$type<ChannelPlatformConfig>(),
    sessionStrategy: sessionStrategyEnum('session_strategy').default('per-user').notNull(),
    systemPrompt: text('system_prompt'),
    agentName: varchar('agent_name', { length: 255 }),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_configs_sandbox').on(table.sandboxId),
    index('idx_channel_configs_account').on(table.accountId),
    index('idx_channel_configs_type').on(table.channelType),
    index('idx_channel_configs_enabled').on(table.enabled),
  ],
);

export const channelSessions = kortixSchema.table(
  'channel_sessions',
  {
    channelSessionId: uuid('channel_session_id').defaultRandom().primaryKey(),
    channelConfigId: uuid('channel_config_id')
      .notNull()
      .references(() => channelConfigs.channelConfigId, { onDelete: 'cascade' }),
    strategyKey: varchar('strategy_key', { length: 512 }).notNull(),
    sessionId: text('session_id').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_sessions_config').on(table.channelConfigId),
    index('idx_channel_sessions_key').on(table.strategyKey),
  ],
);

export const channelMessages = kortixSchema.table(
  'channel_messages',
  {
    channelMessageId: uuid('channel_message_id').defaultRandom().primaryKey(),
    channelConfigId: uuid('channel_config_id')
      .notNull()
      .references(() => channelConfigs.channelConfigId, { onDelete: 'cascade' }),
    direction: varchar('direction', { length: 10 }).notNull(), // 'inbound' | 'outbound'
    externalId: text('external_id'),
    sessionId: text('session_id'),
    chatType: varchar('chat_type', { length: 20 }), // 'dm' | 'group' | 'channel'
    content: text('content'),
    attachments: jsonb('attachments').default([]).$type<unknown[]>(),
    platformUser: jsonb('platform_user').$type<ChannelPlatformUser>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_messages_config').on(table.channelConfigId),
    index('idx_channel_messages_session').on(table.sessionId),
    index('idx_channel_messages_created').on(table.createdAt),
  ],
);

export const channelIdentityMap = kortixSchema.table(
  'channel_identity_map',
  {
    channelIdentityId: uuid('channel_identity_id').defaultRandom().primaryKey(),
    channelConfigId: uuid('channel_config_id')
      .notNull()
      .references(() => channelConfigs.channelConfigId, { onDelete: 'cascade' }),
    platformUserId: text('platform_user_id').notNull(),
    platformUserName: text('platform_user_name'),
    kortixUserId: uuid('kortix_user_id'),
    allowed: boolean('allowed').default(true).notNull(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_channel_identity_config').on(table.channelConfigId),
    index('idx_channel_identity_platform_user').on(table.platformUserId),
  ],
);

// ─── API Keys (sandbox-scoped) ──────────────────────────────────────────────

export const kortixApiKeys = kortixSchema.table(
  'api_keys',
  {
    keyId: uuid('key_id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    publicKey: varchar('public_key', { length: 64 }).notNull(),
    secretKeyHash: varchar('secret_key_hash', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: apiKeyStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_kortix_api_keys_public_key').on(table.publicKey),
    index('idx_kortix_api_keys_secret_hash').on(table.secretKeyHash),
    index('idx_kortix_api_keys_sandbox').on(table.sandboxId),
    index('idx_kortix_api_keys_account').on(table.accountId),
  ],
);

// ─── Integrations (account-level OAuth connections) ─────────────────────────

export const integrations = kortixSchema.table(
  'integrations',
  {
    integrationId: uuid('integration_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    app: varchar('app', { length: 255 }).notNull(),
    appName: varchar('app_name', { length: 255 }),
    providerName: varchar('provider_name', { length: 50 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    label: varchar('label', { length: 255 }),
    status: integrationStatusEnum('status').default('active').notNull(),
    scopes: jsonb('scopes').default([]).$type<string[]>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_integrations_account').on(table.accountId),
    index('idx_integrations_app').on(table.app),
    index('idx_integrations_provider_account').on(table.providerAccountId),
    uniqueIndex('idx_integrations_account_provider_account').on(table.accountId, table.providerAccountId),
  ],
);

export const sandboxIntegrations = kortixSchema.table(
  'sandbox_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.sandboxId, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.integrationId, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_sandbox_integration_unique').on(table.sandboxId, table.integrationId),
    index('idx_sandbox_integrations_sandbox').on(table.sandboxId),
  ],
);

export const sandboxesRelations = relations(sandboxes, ({ many }) => ({
  triggers: many(triggers),
  executions: many(executions),
  deployments: many(deployments),
  channelConfigs: many(channelConfigs),
  apiKeys: many(kortixApiKeys),
  sandboxIntegrationLinks: many(sandboxIntegrations),
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

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [deployments.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));

export const channelConfigsRelations = relations(channelConfigs, ({ one, many }) => ({
  sandbox: one(sandboxes, {
    fields: [channelConfigs.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  sessions: many(channelSessions),
  messages: many(channelMessages),
  identities: many(channelIdentityMap),
}));

export const channelSessionsRelations = relations(channelSessions, ({ one }) => ({
  channelConfig: one(channelConfigs, {
    fields: [channelSessions.channelConfigId],
    references: [channelConfigs.channelConfigId],
  }),
}));

export const channelMessagesRelations = relations(channelMessages, ({ one }) => ({
  channelConfig: one(channelConfigs, {
    fields: [channelMessages.channelConfigId],
    references: [channelConfigs.channelConfigId],
  }),
}));

export const channelIdentityMapRelations = relations(channelIdentityMap, ({ one }) => ({
  channelConfig: one(channelConfigs, {
    fields: [channelIdentityMap.channelConfigId],
    references: [channelConfigs.channelConfigId],
  }),
}));

export const kortixApiKeysRelations = relations(kortixApiKeys, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [kortixApiKeys.sandboxId],
    references: [sandboxes.sandboxId],
  }),
}));

export const integrationsRelations = relations(integrations, ({ many }) => ({
  sandboxIntegrationLinks: many(sandboxIntegrations),
}));

export const sandboxIntegrationsRelations = relations(sandboxIntegrations, ({ one }) => ({
  sandbox: one(sandboxes, {
    fields: [sandboxIntegrations.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  integration: one(integrations, {
    fields: [sandboxIntegrations.integrationId],
    references: [integrations.integrationId],
  }),
}));
