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
  // Tables
  sandboxes,
  triggers,
  executions,
  // Relations
  sandboxesRelations,
  triggersRelations,
  executionsRelations,
} from './schema/kortix';

export type {
  Sandbox,
  Trigger,
  Execution,
  NewSandbox,
  NewTrigger,
  NewExecution,
  SandboxSelect,
  TriggerSelect,
  ExecutionSelect,
} from './types';
