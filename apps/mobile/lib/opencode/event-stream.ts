/**
 * OpenCode SSE Event Stream Hook for React Native
 *
 * Uses react-native-sse for EventSource support since React Native
 * doesn't have native EventSource or fetch streaming.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import EventSource from 'react-native-sse';
import { log } from '@/lib/logger';
import { getAuthToken } from '@/api/config';
import { useSyncStore } from './sync-store';
import { platformKeys } from '@/lib/platform/hooks';
import type { MessageWithParts, Part, SessionStatus } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SSEEvent {
  type: string;
  properties: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Connect to the OpenCode SSE event stream.
 * Should be mounted ONCE at the app level, after sandbox is ready.
 */
export function useOpenCodeEventStream(sandboxUrl: string | undefined) {
  const queryClient = useQueryClient();
  const syncStore = useSyncStore;
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const lastEventTime = useRef(Date.now());
  const mountedRef = useRef(true);

  const handleEvent = useCallback((event: SSEEvent) => {
    const { type, properties: props } = event;
    lastEventTime.current = Date.now();

    switch (type) {
      case 'message.updated': {
        const sessionId = props.info?.sessionID;
        if (!sessionId) break;
        syncStore.getState().upsertMessage(sessionId, {
          info: props.info,
          parts: props.parts || [],
        });
        break;
      }

      case 'message.removed': {
        const { sessionID, messageID } = props;
        if (sessionID && messageID) {
          syncStore.getState().removeMessage(sessionID, messageID);
        }
        break;
      }

      case 'message.part.updated': {
        const { messageID, ...part } = props;
        if (messageID && part) {
          syncStore.getState().upsertPart(messageID, part as Part);
        }
        break;
      }

      case 'session.status': {
        const { sessionID, status } = props;
        if (sessionID && status) {
          syncStore.getState().setStatus(sessionID, status as SessionStatus);
        }
        break;
      }

      case 'session.created':
      case 'session.updated':
      case 'session.deleted':
        queryClient.invalidateQueries({ queryKey: platformKeys.sessions() });
        break;

      case 'session.compacted': {
        if (props.sessionID) {
          queryClient.invalidateQueries({
            queryKey: platformKeys.sessionMessages(props.sessionID),
          });
        }
        break;
      }

      case 'permission.asked':
        if (props.sessionID) syncStore.getState().addPermission(props.sessionID, props as any);
        break;
      case 'permission.replied':
        if (props.sessionID && props.id) syncStore.getState().removePermission(props.sessionID, props.id);
        break;
      case 'question.asked':
        if (props.sessionID) syncStore.getState().addQuestion(props.sessionID, props as any);
        break;
      case 'question.replied':
      case 'question.rejected':
        if (props.sessionID && props.id) syncStore.getState().removeQuestion(props.sessionID, props.id);
        break;

      case 'session.error':
        if (props.sessionID) log.error(`❌ [SSE] Session error in ${props.sessionID}:`, props.error);
        break;

      default:
        break;
    }
  }, [queryClient]);

  const connect = useCallback(async () => {
    if (!sandboxUrl || !mountedRef.current) return;

    // Clean up existing
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      const token = await getAuthToken();
      const url = `${sandboxUrl}/global/event`;

      log.log('🔌 [SSE] Connecting to:', url);

      const es = new EventSource(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      esRef.current = es;

      es.addEventListener('open', () => {
        log.log('✅ [SSE] Connected');
        reconnectAttempts.current = 0;
      });

      es.addEventListener('message', (evt: any) => {
        if (!evt?.data) return;
        try {
          const parsed: SSEEvent = JSON.parse(evt.data);
          handleEvent(parsed);
        } catch {
          // Ignore parse errors (heartbeats, etc.)
        }
      });

      es.addEventListener('error', (evt: any) => {
        if (!mountedRef.current) return;
        log.warn('⚠️ [SSE] Connection error:', evt?.message || 'unknown');
        es.close();
        esRef.current = null;
        scheduleReconnect();
      });
    } catch (error: any) {
      log.error('❌ [SSE] Failed to connect:', error?.message || error);
      scheduleReconnect();
    }
  }, [sandboxUrl, handleEvent]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    const delay = Math.min(250 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectAttempts.current++;

    log.log(`🔄 [SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true;
    if (sandboxUrl) connect();

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [sandboxUrl, connect]);

  // Reconnect when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && sandboxUrl && mountedRef.current) {
        const gap = Date.now() - lastEventTime.current;
        if (gap > 5000) {
          log.log('🔄 [SSE] App foregrounded, reconnecting');
          reconnectAttempts.current = 0;
          connect();
        }
      }
    });
    return () => sub.remove();
  }, [sandboxUrl, connect]);
}
