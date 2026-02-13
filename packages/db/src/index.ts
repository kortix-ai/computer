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
  // Enums
  deploymentStatusEnum,
  deploymentSourceEnum,
  // Kortix tables
  sandboxes,
  triggers,
  executions,
  deployments,
  // Relations
  sandboxesRelations,
  triggersRelations,
  executionsRelations,
  deploymentsRelations,
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
} from './types';
