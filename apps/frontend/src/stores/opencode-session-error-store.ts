'use client';

import { create } from 'zustand';

// ============================================================================
// Session Error Types
// ============================================================================

/**
 * Structured session error received from `session.error` SSE events.
 *
 * The SDK defines these error variants:
 *   ProviderAuthError | UnknownError | MessageOutputLengthError |
 *   MessageAbortedError | ContextOverflowError | ApiError
 *
 * We store the raw error object and derive display properties from it.
 */
export interface SessionError {
  /** Session this error belongs to */
  sessionID: string;
  /** Timestamp when the error was received (client-side) */
  timestamp: number;
  /** Unique ID for deduplication (generated client-side) */
  id: string;
  /** The raw error object from the SDK event */
  error: SessionErrorPayload;
  /** Whether the user has dismissed this error */
  dismissed: boolean;
}

/**
 * Union of all possible error shapes from the SDK.
 * We use a loose type to handle any shape the server sends.
 */
export interface SessionErrorPayload {
  name?: string;
  data?: {
    message?: string;
    providerID?: string;
    statusCode?: number;
    isRetryable?: boolean;
    responseBody?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ============================================================================
// Store
// ============================================================================

interface SessionErrorState {
  /** All active (non-dismissed) errors keyed by error ID */
  errors: Record<string, SessionError>;

  /** Add a new session error from an SSE event */
  addError: (sessionID: string, error: SessionErrorPayload) => void;

  /** Dismiss a specific error */
  dismissError: (errorId: string) => void;

  /** Dismiss all errors for a session */
  dismissSessionErrors: (sessionID: string) => void;

  /** Clear all errors (e.g. on server reconnect) */
  clearAll: () => void;

  /** Get active (non-dismissed) errors for a specific session */
  getSessionErrors: (sessionID: string) => SessionError[];

  /** Get the latest active error for a specific session */
  getLatestSessionError: (sessionID: string) => SessionError | undefined;
}

let errorCounter = 0;

export const useSessionErrorStore = create<SessionErrorState>()((set, get) => ({
  errors: {},

  addError: (sessionID, error) => {
    const id = `err_${Date.now()}_${++errorCounter}`;
    const sessionError: SessionError = {
      sessionID,
      timestamp: Date.now(),
      id,
      error,
      dismissed: false,
    };
    set((state) => ({
      errors: { ...state.errors, [id]: sessionError },
    }));
  },

  dismissError: (errorId) =>
    set((state) => {
      const err = state.errors[errorId];
      if (!err) return state;
      return {
        errors: {
          ...state.errors,
          [errorId]: { ...err, dismissed: true },
        },
      };
    }),

  dismissSessionErrors: (sessionID) =>
    set((state) => {
      const updated = { ...state.errors };
      for (const [id, err] of Object.entries(updated)) {
        if (err.sessionID === sessionID && !err.dismissed) {
          updated[id] = { ...err, dismissed: true };
        }
      }
      return { errors: updated };
    }),

  clearAll: () => set({ errors: {} }),

  getSessionErrors: (sessionID) => {
    const all = Object.values(get().errors);
    return all
      .filter((e) => e.sessionID === sessionID && !e.dismissed)
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  getLatestSessionError: (sessionID) => {
    const errors = get().getSessionErrors(sessionID);
    return errors.length > 0 ? errors[0] : undefined;
  },
}));
