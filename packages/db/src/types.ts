import { sandboxes, triggers, executions } from './schema/kortix';

// Select types (what you get back from queries)
export type Sandbox = typeof sandboxes.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type Execution = typeof executions.$inferSelect;

// Insert types (what you pass to inserts)
export type NewSandbox = typeof sandboxes.$inferInsert;
export type NewTrigger = typeof triggers.$inferInsert;
export type NewExecution = typeof executions.$inferInsert;

// Aliases
export type SandboxSelect = Sandbox;
export type TriggerSelect = Trigger;
export type ExecutionSelect = Execution;
