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
  accountUser,
} from './schema/public';

export type {
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
} from './types';
