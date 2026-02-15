'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useWebNotificationStore } from '@/stores/web-notification-store';
import { notifyTaskComplete } from '@/lib/web-notifications';
import { opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
import type { Session } from '@kortix/opencode-sdk/v2/client';

/**
 * useWebNotifications
 *
 * Monitors session status transitions and pending store changes to fire
 * browser (Web) notifications for:
 *  - Task completions (session goes from busy → idle)
 *  - Errors (session.error events)
 *  - Questions (question.asked events)
 *  - Permissions (permission.asked events)
 *
 * This hook is a passive observer — it does NOT subscribe to SSE events
 * itself. Instead, the SSE event handler in use-opencode-events.ts calls
 * the notification functions directly. This hook handles the one case that
 * can't be detected from a single event: completion detection (busy → idle
 * transition) by watching the status store.
 */
export function useWebNotifications() {
  const queryClient = useQueryClient();
  const statuses = useOpenCodeSessionStatusStore((s) => s.statuses);
  const enabled = useWebNotificationStore((s) => s.preferences.enabled);

  // Track previous statuses to detect transitions
  const prevStatusesRef = useRef<Record<string, string>>({});

  // Helper: get session title from React Query cache
  const getSessionTitle = useCallback(
    (sessionId: string): string | undefined => {
      // Try to get from the sessions list cache first
      const sessions = queryClient.getQueryData<Session[]>(opencodeKeys.sessions());
      if (sessions) {
        const session = sessions.find((s) => s.id === sessionId);
        if (session?.title) return session.title;
      }

      // Fall back to individual session cache
      const session = queryClient.getQueryData<Session>(opencodeKeys.session(sessionId));
      return session?.title || undefined;
    },
    [queryClient],
  );

  // Watch for busy → idle transitions (task completions)
  useEffect(() => {
    if (!enabled) {
      prevStatusesRef.current = {};
      return;
    }

    const prevStatuses = prevStatusesRef.current;

    for (const [sessionId, status] of Object.entries(statuses)) {
      const statusType = typeof status === 'object' && status !== null
        ? (status as any).type
        : String(status);
      const prevType = prevStatuses[sessionId];

      // Detect busy → idle transition = task completion
      if (
        prevType &&
        prevType !== 'idle' &&
        statusType === 'idle'
      ) {
        const title = getSessionTitle(sessionId);
        notifyTaskComplete(sessionId, title);
      }
    }

    // Update previous statuses snapshot
    const newPrev: Record<string, string> = {};
    for (const [sessionId, status] of Object.entries(statuses)) {
      newPrev[sessionId] = typeof status === 'object' && status !== null
        ? (status as any).type
        : String(status);
    }
    prevStatusesRef.current = newPrev;
  }, [statuses, enabled, getSessionTitle]);

  // Sync browser permission on mount
  useEffect(() => {
    useWebNotificationStore.getState().syncPermission();
  }, []);
}
