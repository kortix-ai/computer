'use client';

/**
 * Compatibility re-export — the real data lives in opencode-sync-store.
 * This file exists so external consumers (tab-bar, session-list, etc.)
 * don't need to change their imports.
 *
 * Consumers use patterns like:
 *   useOpenCodeSessionStatusStore((s) => s.statuses)
 *   useOpenCodeSessionStatusStore((s) => s.statuses[sessionId])
 *
 * We proxy these to the sync store's sessionStatus.
 */
import { useSyncStore } from './opencode-sync-store';
import type { SessionStatus } from '@kortix/opencode-sdk/v2/client';

interface SessionStatusState {
  statuses: Record<string, SessionStatus>;
  setStatus: (sessionId: string, status: SessionStatus) => void;
  setStatuses: (statuses: Record<string, SessionStatus>) => void;
}

// Build the compat state object from the sync store state.
// We call the user's selector INSIDE the Zustand selector so
// Zustand only sees the final derived value (not a new wrapper object).
export function useOpenCodeSessionStatusStore<T>(selector: (state: SessionStatusState) => T): T {
  return useSyncStore((s) =>
    selector({
      statuses: s.sessionStatus,
      setStatus: s.setStatus,
      setStatuses: () => {}, // no-op, only SSE sets statuses now
    }),
  );
}

// Static access for non-hook contexts
useOpenCodeSessionStatusStore.getState = () => {
  const s = useSyncStore.getState();
  return {
    statuses: s.sessionStatus,
    setStatus: s.setStatus,
    setStatuses: () => {},
  };
};
