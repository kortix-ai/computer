import { sandboxes, triggers, executions, deployments, channelConfigs, channelPlatformCredentials, channelSessions, channelMessages, channelIdentityMap, kortixApiKeys, integrations, sandboxIntegrations, serverEntries, accounts, accountMembers, creditAccounts, tunnelConnections, tunnelPermissions, tunnelPermissionRequests, tunnelAuditLogs } from './schema/kortix';
import { apiKeys, accountUser } from './schema/public';

// Select types (what you get back from queries)
export type Account = typeof accounts.$inferSelect;
export type AccountMember = typeof accountMembers.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type NewAccountMember = typeof accountMembers.$inferInsert;
export type Sandbox = typeof sandboxes.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type CreditAccount = typeof creditAccounts.$inferSelect;
/** @deprecated Use AccountMember instead — basejump.account_user is being migrated to kortix.account_members */
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
export type ChannelPlatformCredential = typeof channelPlatformCredentials.$inferSelect;
export type NewChannelPlatformCredential = typeof channelPlatformCredentials.$inferInsert;
export type NewChannelSession = typeof channelSessions.$inferInsert;
export type NewChannelMessage = typeof channelMessages.$inferInsert;
export type NewChannelIdentity = typeof channelIdentityMap.$inferInsert;
export type NewKortixApiKey = typeof kortixApiKeys.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type SandboxIntegration = typeof sandboxIntegrations.$inferSelect;
export type NewSandboxIntegration = typeof sandboxIntegrations.$inferInsert;
export type ServerEntry = typeof serverEntries.$inferSelect;
export type NewServerEntry = typeof serverEntries.$inferInsert;

// Tunnel
export type TunnelConnection = typeof tunnelConnections.$inferSelect;
export type NewTunnelConnection = typeof tunnelConnections.$inferInsert;
export type TunnelPermission = typeof tunnelPermissions.$inferSelect;
export type NewTunnelPermission = typeof tunnelPermissions.$inferInsert;
export type TunnelPermissionRequest = typeof tunnelPermissionRequests.$inferSelect;
export type NewTunnelPermissionRequest = typeof tunnelPermissionRequests.$inferInsert;
export type TunnelAuditLog = typeof tunnelAuditLogs.$inferSelect;
export type NewTunnelAuditLog = typeof tunnelAuditLogs.$inferInsert;

// Aliases
export type SandboxSelect = Sandbox;
export type TriggerSelect = Trigger;
export type ExecutionSelect = Execution;
export type DeploymentSelect = Deployment;
