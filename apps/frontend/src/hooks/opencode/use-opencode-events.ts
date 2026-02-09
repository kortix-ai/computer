'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getOpenCodeEventStreamUrl } from '@/lib/api/opencode';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { opencodeKeys } from './use-opencode-sessions';

/**
 * Connects to OpenCode's SSE event stream (GET /event) and
 * invalidates React Query caches when relevant events arrive.
 */
export function useOpenCodeEventStream() {
  const queryClient = useQueryClient();
  const setStatus = useOpenCodeSessionStatusStore((s) => s.setStatus);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = getOpenCodeEventStreamUrl();
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type: string = data?.type;
        if (!type) return;

        // Message events → invalidate messages for the session
        if (type === 'message.updated' || type === 'message.removed') {
          const sessionID = data.properties?.info?.sessionID;
          if (sessionID) {
            queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(sessionID) });
          }
        }

        if (type === 'message.part.updated' || type === 'message.part.removed') {
          const sessionID =
            data.properties?.part?.sessionID ?? data.properties?.sessionID;
          if (sessionID) {
            queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(sessionID) });
          }
        }

        // Session lifecycle events → invalidate sessions list + individual session
        if (
          type === 'session.created' ||
          type === 'session.updated' ||
          type === 'session.deleted'
        ) {
          queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
          const sessionID = data.properties?.id ?? data.properties?.info?.id;
          if (sessionID) {
            queryClient.invalidateQueries({ queryKey: opencodeKeys.session(sessionID) });
          }
        }

        // Session status events → update Zustand store
        if (type === 'session.status') {
          const sessionID = data.properties?.sessionID;
          const status = data.properties?.status;
          if (sessionID && status) {
            setStatus(sessionID, status);
          }
        }

        // Session idle (deprecated but still emitted)
        if (type === 'session.idle') {
          const sessionID = data.properties?.sessionID;
          if (sessionID) {
            setStatus(sessionID, { type: 'idle' });
          }
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects, nothing extra needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [queryClient, setStatus]);
}
