'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

  // Compute raw busy state for all known sessions synchronously
  const rawBusy = useMemo(() => {
    const result: Record<string, boolean> = {};
    const allIds = new Set([
      ...Object.keys(statuses),
      ...Object.keys(syncStatuses),
    ]);

    for (const sessionId of allIds) {
      const statusBusy =
        statuses[sessionId]?.type === 'busy' ||
        statuses[sessionId]?.type === 'retry' ||
        syncStatuses[sessionId]?.type === 'busy' ||
        syncStatuses[sessionId]?.type === 'retry';

      if (statusBusy) {
        result[sessionId] = true;
        continue;
      }

      // Check if the latest assistant message is still incomplete
      const msgs = syncMessages[sessionId];
      if (msgs && msgs.length > 0) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            if (!(msgs[i] as any).time?.completed) {
              result[sessionId] = true;
            }
            break;
          }
        }
      }
    }
    return result;
  }, [statuses, syncStatuses, syncMessages]);

  // Debounced state: goes true immediately, stays true for debounceMs after raw goes false
  const [debouncedBusy, setDebouncedBusy] = useState<Record<string, boolean>>(rawBusy);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const allIds = new Set([
      ...Object.keys(rawBusy),
      ...Object.keys(debouncedBusy),
    ]);

    for (const sessionId of allIds) {
      const isRawBusy = rawBusy[sessionId] ?? false;
      const isDebouncedBusy = debouncedBusy[sessionId] ?? false;

      if (isRawBusy && !isDebouncedBusy) {
        // Going busy: update immediately, cancel any pending idle timer
        if (timersRef.current[sessionId]) {
          clearTimeout(timersRef.current[sessionId]);
          delete timersRef.current[sessionId];
        }
        setDebouncedBusy((prev) => ({ ...prev, [sessionId]: true }));
      } else if (!isRawBusy && isDebouncedBusy) {
        // Going idle: start debounce timer (if not already running)
        if (!timersRef.current[sessionId]) {
          timersRef.current[sessionId] = setTimeout(() => {
            delete timersRef.current[sessionId];
            setDebouncedBusy((prev) => ({ ...prev, [sessionId]: false }));
          }, debounceMs);
        }
      } else if (isRawBusy && isDebouncedBusy) {
        // Still busy: cancel any pending idle timer
        if (timersRef.current[sessionId]) {
          clearTimeout(timersRef.current[sessionId]);
          delete timersRef.current[sessionId];
        }
      }
    }
    // Intentionally excluding debouncedBusy to avoid re-running when we set it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawBusy, debounceMs]);

  // Cleanup on unmount only
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
      }
    };
  }, []);

  return debouncedBusy;
}
