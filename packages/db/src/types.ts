import { sandboxes, triggers, executions, deployments } from './schema/kortix';
import { apiKeys, creditAccounts, accountUser } from './schema/public';

// Select types (what you get back from queries)
export type Sandbox = typeof sandboxes.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type CreditAccount = typeof creditAccounts.$inferSelect;
export type AccountUser = typeof accountUser.$inferSelect;

// Insert types (what you pass to inserts)
export type NewSandbox = typeof sandboxes.$inferInsert;
export type NewTrigger = typeof triggers.$inferInsert;
export type Deployment = typeof deployments.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
export type NewDeployment = typeof deployments.$inferInsert;
export type NewApiKey = typeof apiKeys.$inferInsert;

// Aliases
export type SandboxSelect = Sandbox;
export type TriggerSelect = Trigger;
export type ExecutionSelect = Execution;
export type DeploymentSelect = Deployment;
