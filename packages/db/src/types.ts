import { sandboxes, triggers, executions, deployments, channelConfigs, channelSessions, channelMessages, channelIdentityMap, kortixApiKeys, integrations, sandboxIntegrations } from './schema/kortix';
import { apiKeys, creditAccounts, accountUser } from './schema/public';

// Select types (what you get back from queries)
export type Sandbox = typeof sandboxes.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type CreditAccount = typeof creditAccounts.$inferSelect;
export type AccountUser = typeof accountUser.$inferSelect;
export type ChannelConfig = typeof channelConfigs.$inferSelect;
export type ChannelSession = typeof channelSessions.$inferSelect;
export type ChannelMessage = typeof channelMessages.$inferSelect;
export type ChannelIdentity = typeof channelIdentityMap.$inferSelect;
export type KortixApiKey = typeof kortixApiKeys.$inferSelect;

// Insert types (what you pass to inserts)
export type NewSandbox = typeof sandboxes.$inferInsert;
export type NewTrigger = typeof triggers.$inferInsert;
export type Deployment = typeof deployments.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
export type NewDeployment = typeof deployments.$inferInsert;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type NewChannelConfig = typeof channelConfigs.$inferInsert;
export type NewChannelSession = typeof channelSessions.$inferInsert;
export type NewChannelMessage = typeof channelMessages.$inferInsert;
export type NewChannelIdentity = typeof channelIdentityMap.$inferInsert;
export type NewKortixApiKey = typeof kortixApiKeys.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type SandboxIntegration = typeof sandboxIntegrations.$inferSelect;
export type NewSandboxIntegration = typeof sandboxIntegrations.$inferInsert;

// Aliases
export type SandboxSelect = Sandbox;
export type TriggerSelect = Trigger;
export type ExecutionSelect = Execution;
export type DeploymentSelect = Deployment;
