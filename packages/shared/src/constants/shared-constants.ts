/**
 * Shared constants for AgentPress
 *
 * Extracted from: apps/frontend/src/lib/streaming/constants.ts
 * Canonical values used by both frontend and mobile.
 */

/**
 * Keywords that indicate a billing / credits error in stream messages.
 */
export const BILLING_ERROR_KEYWORDS = [
  'insufficient credits',
  'out of credits',
  'no credits',
  'balance',
  'credit',
  'billing check failed',
] as const;

/**
 * Patterns that signal an agent run stream has completed.
 */
export const COMPLETION_MESSAGE_PATTERNS = [
  '"type": "status"',
  '"status": "completed"',
  'Run data not available for streaming',
  'Stream ended with status: completed',
] as const;

/**
 * Agent run statuses that are terminal (no further events expected).
 */
export const TERMINAL_STATUSES = [
  'completed',
  'stopped',
  'failed',
  'error',
  'agent_not_running',
] as const;

/** Derived type for a single terminal status value. */
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];
