import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  bigint,
  index,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

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
  'hetzner',
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

export const apiKeyTypeEnum = kortixSchema.enum('api_key_type', [
  'user',
  'sandbox',
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

// ─── Accounts & Members ─────────────────────────────────────────────────────
// Replaces basejump.account_user. Fully kortix-native.

export const accountRoleEnum = kortixSchema.enum('account_role', [
  'owner',
  'admin',
  'member',
]);

export const accounts = kortixSchema.table(
  'accounts',
  {
    accountId: uuid('account_id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    personalAccount: boolean('personal_account').default(true).notNull(),
    setupCompleteAt: timestamp('setup_complete_at', { withTimezone: true }),
    setupWizardStep: integer('setup_wizard_step').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const accountMembers = kortixSchema.table(
  'account_members',
  {
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.accountId, { onDelete: 'cascade' }),
    accountRole: accountRoleEnum('account_role').default('owner').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_account_members_user_id').on(table.userId),
    index('idx_account_members_account_id').on(table.accountId),
    uniqueIndex('idx_account_members_user_account').on(table.userId, table.accountId),
  ],
);

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
    config: jsonb('config').default({}).$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
    pooledAt: timestamp('pooled_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Billing: tracks included vs additional (paid) instances
    isIncluded: boolean('is_included').default(false).notNull(),
    stripeSubscriptionItemId: text('stripe_subscription_item_id'),
  },
  (table) => [
    index('idx_sandboxes_account').on(table.accountId),
    index('idx_sandboxes_external_id').on(table.externalId),
    index('idx_sandboxes_status').on(table.status),
    index('idx_sandboxes_pooled_fifo').on(table.pooledAt),
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
    type: apiKeyTypeEnum('type').default('user').notNull(),
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

// ─── Server Entries ──────────────────────────────────────────────────────────
// User-configured server/instance entries (persisted from the frontend).
// Auth tokens are NOT stored — they remain in the browser's localStorage.

export const serverEntries = kortixSchema.table(
  'server_entries',
  {
    /** Auto-generated row PK. */
    entryId: uuid('entry_id').defaultRandom().primaryKey(),
    /** Frontend-assigned entry ID (e.g. 'default', 'cloud-sandbox', 'srv_xxx'). Unique per account. */
    id: varchar('id', { length: 128 }).notNull(),
    /** Owner account — scopes entries per-user. Null in local mode (single user). */
    accountId: uuid('account_id'),
    label: varchar('label', { length: 255 }).notNull(),
    url: text('url').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    provider: sandboxProviderEnum('provider'),
    sandboxId: text('sandbox_id'),
    mappedPorts: jsonb('mapped_ports').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_server_entries_default').on(table.isDefault),
    index('idx_server_entries_account').on(table.accountId),
    uniqueIndex('idx_server_entries_account_id').on(table.accountId, table.id),
  ],
);

export const sandboxesRelations = relations(sandboxes, ({ one, many }) => ({
  account: one(accounts, {
    fields: [sandboxes.accountId],
    references: [accounts.accountId],
  }),
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

// ─── Account Relations ──────────────────────────────────────────────────────

export const accountsRelations = relations(accounts, ({ many }) => ({
  members: many(accountMembers),
  sandboxes: many(sandboxes),
}));

export const accountMembersRelations = relations(accountMembers, ({ one }) => ({
  account: one(accounts, {
    fields: [accountMembers.accountId],
    references: [accounts.accountId],
  }),
}));

// ─── Billing / Credits ─────────────────────────────────────────────────────

export const billingCustomers = kortixSchema.table(
  'billing_customers',
  {
    accountId: uuid('account_id').notNull(),
    id: text().primaryKey().notNull(),
    email: text(),
    active: boolean(),
    provider: text(),
  },
  (table) => [
    index('idx_kortix_billing_customers_account_id').on(table.accountId),
  ],
);

export const creditAccounts = kortixSchema.table(
  'credit_accounts',
  {
    accountId: uuid('account_id').primaryKey().notNull(),
    balance: numeric('balance', { precision: 12, scale: 4 }).default('0').notNull(),
    lifetimeGranted: numeric('lifetime_granted', { precision: 12, scale: 4 }).default('0').notNull(),
    lifetimePurchased: numeric('lifetime_purchased', { precision: 12, scale: 4 }).default('0').notNull(),
    lifetimeUsed: numeric('lifetime_used', { precision: 12, scale: 4 }).default('0').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    lastGrantDate: timestamp('last_grant_date', { withTimezone: true, mode: 'string' }),
    tier: varchar('tier', { length: 50 }).default('free'),
    billingCycleAnchor: timestamp('billing_cycle_anchor', { withTimezone: true, mode: 'string' }),
    nextCreditGrant: timestamp('next_credit_grant', { withTimezone: true, mode: 'string' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    expiringCredits: numeric('expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
    nonExpiringCredits: numeric('non_expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
    dailyCreditsBalance: numeric('daily_credits_balance', { precision: 10, scale: 2 }).default('0').notNull(),
    trialStatus: varchar('trial_status', { length: 20 }).default('none'),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true, mode: 'string' }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'string' }),
    isGrandfatheredFree: boolean('is_grandfathered_free').default(false),
    lastProcessedInvoiceId: varchar('last_processed_invoice_id', { length: 255 }),
    commitmentType: varchar('commitment_type', { length: 50 }),
    commitmentStartDate: timestamp('commitment_start_date', { withTimezone: true, mode: 'string' }),
    commitmentEndDate: timestamp('commitment_end_date', { withTimezone: true, mode: 'string' }),
    commitmentPriceId: varchar('commitment_price_id', { length: 255 }),
    canCancelAfter: timestamp('can_cancel_after', { withTimezone: true, mode: 'string' }),
    lastRenewalPeriodStart: bigint('last_renewal_period_start', { mode: 'number' }),
    paymentStatus: text('payment_status').default('active'),
    lastPaymentFailure: timestamp('last_payment_failure', { withTimezone: true, mode: 'string' }),
    scheduledTierChange: text('scheduled_tier_change'),
    scheduledTierChangeDate: timestamp('scheduled_tier_change_date', { withTimezone: true, mode: 'string' }),
    scheduledPriceId: text('scheduled_price_id'),
    provider: varchar('provider', { length: 20 }).default('stripe'),
    revenuecatCustomerId: varchar('revenuecat_customer_id', { length: 255 }),
    revenuecatSubscriptionId: varchar('revenuecat_subscription_id', { length: 255 }),
    revenuecatCancelledAt: timestamp('revenuecat_cancelled_at', { withTimezone: true, mode: 'string' }),
    revenuecatCancelAtPeriodEnd: timestamp('revenuecat_cancel_at_period_end', { withTimezone: true, mode: 'string' }),
    revenuecatPendingChangeProduct: text('revenuecat_pending_change_product'),
    revenuecatPendingChangeDate: timestamp('revenuecat_pending_change_date', { withTimezone: true, mode: 'string' }),
    revenuecatPendingChangeType: text('revenuecat_pending_change_type'),
    revenuecatProductId: text('revenuecat_product_id'),
    planType: varchar('plan_type', { length: 50 }).default('monthly'),
    stripeSubscriptionStatus: varchar('stripe_subscription_status', { length: 50 }),
    lastDailyRefresh: timestamp('last_daily_refresh', { withTimezone: true, mode: 'string' }),
    // Auto-topup configuration
    autoTopupEnabled: boolean('auto_topup_enabled').default(false).notNull(),
    autoTopupThreshold: numeric('auto_topup_threshold', { precision: 10, scale: 2 }).default('5').notNull(),
    autoTopupAmount: numeric('auto_topup_amount', { precision: 10, scale: 2 }).default('15').notNull(),
    autoTopupLastCharged: timestamp('auto_topup_last_charged', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('kortix_credit_accounts_account_id_idx').on(table.accountId),
  ],
);

export const creditLedger = kortixSchema.table(
  'credit_ledger',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    accountId: uuid('account_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),
    type: text().notNull(),
    description: text(),
    referenceId: uuid('reference_id'),
    referenceType: text('reference_type'),
    metadata: jsonb().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    createdBy: uuid('created_by'),
    isExpiring: boolean('is_expiring').default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    stripeEventId: varchar('stripe_event_id', { length: 255 }),
    idempotencyKey: text('idempotency_key'),
    processingSource: text('processing_source'),
  },
  (table) => [
    unique('kortix_unique_stripe_event').on(table.stripeEventId),
    index('idx_kortix_credit_ledger_idempotency')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const creditUsage = kortixSchema.table('credit_usage', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amountDollars: numeric('amount_dollars', { precision: 10, scale: 2 }).notNull(),
  description: text(),
  usageType: text('usage_type').default('token_overage'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  subscriptionTier: text('subscription_tier'),
  metadata: jsonb().default({}),
});

export const accountDeletionRequests = kortixSchema.table('account_deletion_requests', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text().default('pending').notNull(),
  reason: text(),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
});

export const creditPurchases = kortixSchema.table('credit_purchases', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amountDollars: numeric('amount_dollars', { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  status: text().default('pending').notNull(),
  description: text(),
  metadata: jsonb().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  provider: varchar('provider', { length: 50 }).default('stripe'),
  revenuecatTransactionId: varchar('revenuecat_transaction_id', { length: 255 }),
  revenuecatProductId: varchar('revenuecat_product_id', { length: 255 }),
});

// ─── Tunnel (Reverse-Tunnel to Local Machine) ──────────────────────────────

export const tunnelStatusEnum = kortixSchema.enum('tunnel_status', [
  'online',
  'offline',
  'connecting',
]);

export const tunnelCapabilityEnum = kortixSchema.enum('tunnel_capability', [
  'filesystem',
  'shell',
  'network',
  'apps',
  'hardware',
  'desktop',
  'gpu',
]);

export const tunnelPermissionStatusEnum = kortixSchema.enum('tunnel_permission_status', [
  'active',
  'revoked',
  'expired',
]);

export const tunnelPermissionRequestStatusEnum = kortixSchema.enum('tunnel_permission_request_status', [
  'pending',
  'approved',
  'denied',
  'expired',
]);

/** Machine info reported by the local agent on connect. */
export interface TunnelMachineInfo {
  hostname: string;
  platform: string;
  arch: string;
  osVersion?: string;
  nodeVersion?: string;
  agentVersion?: string;
  [key: string]: unknown;
}

/** Scope shape for filesystem capability. */
export interface TunnelFilesystemScope {
  paths: string[];
  operations: ('read' | 'write' | 'list' | 'delete')[];
  maxFileSize?: number;
  excludePatterns?: string[];
}

/** Scope shape for shell capability. */
export interface TunnelShellScope {
  commands: string[];
  workingDir?: string;
  maxTimeout?: number;
}

/** Scope shape for network capability. */
export interface TunnelNetworkScope {
  ports: number[];
  hosts: string[];
  protocols: ('http' | 'tcp')[];
}

/** Union of all capability scopes. */
export type TunnelPermissionScope =
  | TunnelFilesystemScope
  | TunnelShellScope
  | TunnelNetworkScope
  | Record<string, unknown>;

export const tunnelConnections = kortixSchema.table(
  'tunnel_connections',
  {
    tunnelId: uuid('tunnel_id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    sandboxId: uuid('sandbox_id').references(() => sandboxes.sandboxId, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    status: tunnelStatusEnum('status').default('offline').notNull(),
    capabilities: jsonb('capabilities').default([]).$type<string[]>(),
    machineInfo: jsonb('machine_info').default({}).$type<TunnelMachineInfo>(),
    setupTokenHash: varchar('setup_token_hash', { length: 128 }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_connections_account').on(table.accountId),
    index('idx_tunnel_connections_sandbox').on(table.sandboxId),
    index('idx_tunnel_connections_status').on(table.status),
  ],
);

export const tunnelPermissions = kortixSchema.table(
  'tunnel_permissions',
  {
    permissionId: uuid('permission_id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnelConnections.tunnelId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    capability: tunnelCapabilityEnum('capability').notNull(),
    scope: jsonb('scope').default({}).$type<TunnelPermissionScope>(),
    status: tunnelPermissionStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_permissions_tunnel').on(table.tunnelId),
    index('idx_tunnel_permissions_account').on(table.accountId),
    index('idx_tunnel_permissions_capability').on(table.capability),
    index('idx_tunnel_permissions_status').on(table.status),
  ],
);

export const tunnelPermissionRequests = kortixSchema.table(
  'tunnel_permission_requests',
  {
    requestId: uuid('request_id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnelConnections.tunnelId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    capability: tunnelCapabilityEnum('capability').notNull(),
    requestedScope: jsonb('requested_scope').default({}).$type<TunnelPermissionScope>(),
    reason: text('reason'),
    status: tunnelPermissionRequestStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_perm_requests_tunnel').on(table.tunnelId),
    index('idx_tunnel_perm_requests_account').on(table.accountId),
    index('idx_tunnel_perm_requests_status').on(table.status),
  ],
);

export const tunnelAuditLogs = kortixSchema.table(
  'tunnel_audit_logs',
  {
    logId: uuid('log_id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnelConnections.tunnelId, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    capability: tunnelCapabilityEnum('capability').notNull(),
    operation: varchar('operation', { length: 100 }).notNull(),
    requestSummary: jsonb('request_summary').default({}).$type<Record<string, unknown>>(),
    success: boolean('success').notNull(),
    durationMs: integer('duration_ms'),
    bytesTransferred: integer('bytes_transferred'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tunnel_audit_tunnel').on(table.tunnelId),
    index('idx_tunnel_audit_account').on(table.accountId),
    index('idx_tunnel_audit_capability').on(table.capability),
    index('idx_tunnel_audit_created').on(table.createdAt),
  ],
);

// ─── Tunnel Relations ────────────────────────────────────────────────────────

export const tunnelConnectionsRelations = relations(tunnelConnections, ({ one, many }) => ({
  account: one(accounts, {
    fields: [tunnelConnections.accountId],
    references: [accounts.accountId],
  }),
  sandbox: one(sandboxes, {
    fields: [tunnelConnections.sandboxId],
    references: [sandboxes.sandboxId],
  }),
  permissions: many(tunnelPermissions),
  permissionRequests: many(tunnelPermissionRequests),
  auditLogs: many(tunnelAuditLogs),
}));

export const tunnelPermissionsRelations = relations(tunnelPermissions, ({ one }) => ({
  tunnel: one(tunnelConnections, {
    fields: [tunnelPermissions.tunnelId],
    references: [tunnelConnections.tunnelId],
  }),
}));

export const tunnelPermissionRequestsRelations = relations(tunnelPermissionRequests, ({ one }) => ({
  tunnel: one(tunnelConnections, {
    fields: [tunnelPermissionRequests.tunnelId],
    references: [tunnelConnections.tunnelId],
  }),
}));

export const tunnelAuditLogsRelations = relations(tunnelAuditLogs, ({ one }) => ({
  tunnel: one(tunnelConnections, {
    fields: [tunnelAuditLogs.tunnelId],
    references: [tunnelConnections.tunnelId],
  }),
}));

// ─── Access Control ─────────────────────────────────────────────────────────

// ─── Platform User Roles ────────────────────────────────────────────────────
// Platform-level roles (not account-scoped). Controls admin access to the platform.

export const platformRoleEnum = kortixSchema.enum('platform_role', [
  'user',
  'admin',
  'super_admin',
]);

export const platformUserRoles = kortixSchema.table(
  'platform_user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    role: platformRoleEnum('role').default('user').notNull(),
    grantedBy: uuid('granted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_platform_user_roles_account_id').on(table.accountId),
    index('idx_platform_user_roles_role').on(table.role),
  ],
);

// ─── Access Control ─────────────────────────────────────────────────────────

export const accessRequestStatusEnum = kortixSchema.enum('access_request_status', [
  'pending',
  'approved',
  'rejected',
]);

export const platformSettings = kortixSchema.table(
  'platform_settings',
  {
    key: varchar('key', { length: 255 }).primaryKey(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const accessAllowlist = kortixSchema.table(
  'access_allowlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryType: varchar('entry_type', { length: 20 }).notNull(), // 'email' | 'domain'
    value: varchar('value', { length: 255 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_access_allowlist_type_value').on(table.entryType, table.value),
  ],
);

export const accessRequests = kortixSchema.table(
  'access_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    company: varchar('company', { length: 255 }),
    useCase: text('use_case'),
    status: accessRequestStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_access_requests_email').on(table.email),
    index('idx_access_requests_status').on(table.status),
  ],
);

// ─── WoA (Wisdom of Agents) ─────────────────────────────────────────────────

export const woaPostTypeEnum = kortixSchema.enum('woa_post_type', [
  'question',
  'solution',
  'me_too',
  'update',
]);

export const woaPosts = kortixSchema.table(
  'woa_posts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    hash: varchar('hash', { length: 8 }).notNull().unique(),
    postType: woaPostTypeEnum('post_type').notNull(),
    content: text('content').notNull(),
    refs: text('refs').array().default([]).notNull(),
    tags: text('tags').array().default([]).notNull(),
    agentHash: varchar('agent_hash', { length: 16 }).notNull(),
    context: jsonb('context').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_woa_posts_refs').using('gin', table.refs),
    index('idx_woa_posts_tags').using('gin', table.tags),
    index('idx_woa_posts_created').on(table.createdAt),
    index('idx_woa_posts_fts').using('gin', sql`to_tsvector('english', ${table.content})`),
  ],
);
