// Main exports
export { createDb, type Database } from './client';
export * as schema from './schema';

// Re-export frequently used schemas and types for convenience
export {
  // Schema namespace
  kortixSchema,
  // Enums
  sandboxStatusEnum,
  executionStatusEnum,
  sessionModeEnum,
  deploymentStatusEnum,
  deploymentSourceEnum,
  channelTypeEnum,
  sessionStrategyEnum,
  apiKeyStatusEnum,
  // Kortix tables — accounts
  accounts,
  accountMembers,
  accountRoleEnum,
  accountsRelations,
  accountMembersRelations,
  // Kortix tables
  sandboxes,
  triggers,
  executions,
  deployments,
  channelConfigs,
  channelSessions,
  channelMessages,
  channelIdentityMap,
  kortixApiKeys,
  integrations,
  sandboxIntegrations,
  serverEntries,
  // Enums (integrations)
  integrationStatusEnum,
  // Relations
  sandboxesRelations,
  triggersRelations,
  executionsRelations,
  deploymentsRelations,
  channelConfigsRelations,
  channelSessionsRelations,
  channelMessagesRelations,
  channelIdentityMapRelations,
  kortixApiKeysRelations,
  integrationsRelations,
  sandboxIntegrationsRelations,
} from './schema/kortix';

export type {
  ChannelCredentials,
  ChannelPlatformConfig,
  ChannelPlatformUser,
} from './schema/kortix';

// Public/basejump tables
export {
  apiKeys,
  creditAccounts,
  creditLedger,
  creditUsage,
  accountDeletionRequests,
  creditPurchases,
  billingCustomers,
  accountUser,
} from './schema/public';

export type {
  Account,
  AccountMember,
  NewAccount,
  NewAccountMember,
  Sandbox,
  Trigger,
  Execution,
  NewSandbox,
  NewTrigger,
  NewExecution,
  ApiKey,
  CreditAccount,
  AccountUser,
  NewApiKey,
  SandboxSelect,
  TriggerSelect,
  ExecutionSelect,
  ChannelConfig,
  ChannelSession,
  ChannelMessage,
  ChannelIdentity,
  NewChannelConfig,
  NewChannelSession,
  NewChannelMessage,
  NewChannelIdentity,
  KortixApiKey,
  NewKortixApiKey,
  Integration,
  NewIntegration,
  SandboxIntegration,
  NewSandboxIntegration,
  ServerEntry,
  NewServerEntry,
} from './types';
