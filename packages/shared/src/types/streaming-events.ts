/**
 * Rich UX streaming events for AgentPress
 *
 * These event interfaces describe the structured payloads that the backend
 * sends over the SSE stream for enhanced client-side UX.  The frontend
 * renders them; mobile may ignore them initially but the types are
 * available for future adoption.
 *
 * Source of truth: frontend (apps/frontend/src/lib/streaming/types.ts)
 */

// ---------------------------------------------------------------------------
// Ack — confirms the backend received and started processing a run
// ---------------------------------------------------------------------------

export interface AckEvent {
  message?: string;
  agent_run_id: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Estimate — predicted wall-clock duration for the run
// ---------------------------------------------------------------------------

export interface EstimateEvent {
  estimated_seconds: number;
  confidence: 'low' | 'medium' | 'high';
  message?: string;
  breakdown?: {
    prep: number;
    llm: number;
    tools: number;
  };
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Prep Stage — sandbox / environment initialization progress
// ---------------------------------------------------------------------------

export interface PrepStageEvent {
  stage: 'initializing' | 'preparing' | 'loading' | 'ready';
  detail?: string;
  progress?: number;
  message?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Degradation — partial outage or performance warnings
// ---------------------------------------------------------------------------

export interface DegradationEvent {
  component: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  user_impact?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Thinking — model reasoning / chain-of-thought indicator
// ---------------------------------------------------------------------------

export interface ThinkingEvent {
  status?: 'started' | 'thinking' | 'complete';
  message?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Stream Error — structured, recoverable error with suggested actions
// ---------------------------------------------------------------------------

export type StreamErrorRecoveryActionType =
  | 'retry'
  | 'link'
  | 'switch_model'
  | 'new_thread'
  | 'simplify';

export interface StreamErrorRecoveryAction {
  type: StreamErrorRecoveryActionType;
  label: string;
  url?: string;
  delay_seconds?: number;
}

export interface StreamErrorEvent {
  error?: string;
  error_code: string;
  message: string;
  recoverable: boolean;
  recovery_actions?: StreamErrorRecoveryAction[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Context Usage — token budget consumed so far
// ---------------------------------------------------------------------------

export interface ContextUsageEvent {
  current_tokens: number;
  max_tokens: number;
  message_count: number;
  compressed: boolean;
}

// ---------------------------------------------------------------------------
// Union of all rich UX events (for discriminated-union handlers)
// ---------------------------------------------------------------------------

export type StreamUxEventType =
  | 'ack'
  | 'estimate'
  | 'prep_stage'
  | 'degradation'
  | 'thinking'
  | 'stream_error'
  | 'context_usage';

export type StreamUxEvent =
  | { type: 'ack'; data: AckEvent }
  | { type: 'estimate'; data: EstimateEvent }
  | { type: 'prep_stage'; data: PrepStageEvent }
  | { type: 'degradation'; data: DegradationEvent }
  | { type: 'thinking'; data: ThinkingEvent }
  | { type: 'stream_error'; data: StreamErrorEvent }
  | { type: 'context_usage'; data: ContextUsageEvent };
