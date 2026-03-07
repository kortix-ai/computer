'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncStore } from '@/stores/opencode-sync-store';

/**
 * Debounced busy state — prevents green dot from flickering off between
 * agentic steps or during reasoning when the server briefly reports idle.
 * Mirrors the approach in session-chat.tsx.
 *
 * Checks multiple signals:
 * 1. Legacy status store (statuses prop)
 * 2. Sync store session status
 * 3. Incomplete assistant message (no time.completed)
 *
 * Goes busy immediately, but debounces the transition to idle by `debounceMs`.
 */
export function useDebouncedBusySessions(
  statuses: Record<string, { type: string }>,
  debounceMs = 2000,
) {
  const syncMessages = useSyncStore((s) => s.messages);
  const syncStatuses = useSyncStore((s) => s.sessionStatus);

  const computeRawBusy = useCallback(
    (sessionId: string) => {
      const statusBusy =
        statuses[sessionId]?.type === 'busy' ||
        statuses[sessionId]?.type === 'retry' ||
        syncStatuses[sessionId]?.type === 'busy' ||
        syncStatuses[sessionId]?.type === 'retry';
      if (statusBusy) return true;

      // Check if the latest assistant message is still incomplete
      const msgs = syncMessages[sessionId];
      if (msgs && msgs.length > 0) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            return !(msgs[i] as any).time?.completed;
          }
        }
      }
      return false;
    },
    [statuses, syncStatuses, syncMessages],
  );

  const [debouncedBusy, setDebouncedBusy] = useState<Record<string, boolean>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const allIds = new Set([
      ...Object.keys(statuses),
      ...Object.keys(syncStatuses),
    ]);

    for (const sessionId of allIds) {
      const rawBusy = computeRawBusy(sessionId);
      const currentDebounced = debouncedBusy[sessionId] ?? false;

      if (rawBusy && !currentDebounced) {
        // Going busy: update immediately
        clearTimeout(timersRef.current[sessionId]);
        delete timersRef.current[sessionId];
        setDebouncedBusy((prev) => ({ ...prev, [sessionId]: true }));
      } else if (!rawBusy && currentDebounced) {
        // Going idle: debounce
        if (!timersRef.current[sessionId]) {
          timersRef.current[sessionId] = setTimeout(() => {
            delete timersRef.current[sessionId];
            setDebouncedBusy((prev) => ({ ...prev, [sessionId]: false }));
          }, debounceMs);
        }
      }
    }

    return () => {
      for (const timer of Object.values(timersRef.current)) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, syncStatuses, syncMessages, computeRawBusy, debounceMs]);

  return debouncedBusy;
}
