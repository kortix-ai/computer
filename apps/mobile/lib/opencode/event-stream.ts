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
import { useSyncStore, isOptimistic } from './sync-store';
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
        const info = props.info;
        const sessionId = info?.sessionID;
        if (!sessionId || !info) break;

        const state = syncStore.getState();
        const existing = state.messages[sessionId] || [];

        // When a real user message arrives from the server, remove
        // optimistic user messages. Real parts arrive via message.part.updated.
        if (info.role === 'user' && !isOptimistic(info.id)) {
          const optimisticMsgs = existing.filter(
            (m) => m.info.role === 'user' && isOptimistic(m.info.id),
          );
          if (optimisticMsgs.length > 0) {
            const optimisticIdSet = new Set(optimisticMsgs.map((m) => m.info.id));
            const withoutOptimistic = existing.filter(
              (m) => !optimisticIdSet.has(m.info.id),
            );
            syncStore.setState({
              messages: {
                ...syncStore.getState().messages,
                [sessionId]: [
                  ...withoutOptimistic,
                  { info, parts: [] },
                ],
              },
            });
            break;
          }
        }

        // For non-optimistic swaps: preserve existing parts
        const existingMsg = existing.find((m) => m.info.id === info.id);
        state.upsertMessage(sessionId, {
          info,
          parts: existingMsg?.parts || [],
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
        const part = props.part || props;
        const messageID = part?.messageID || props.messageID;
        if (!messageID || !part) break;

        const sessionID = part.sessionID || props.sessionID;

        // If the parent message doesn't exist yet, create a stub
        // (parts can arrive before message.updated)
        if (sessionID) {
          const state = syncStore.getState();
          const msgs = state.messages[sessionID];
          if (!msgs || !msgs.some((m) => m.info.id === messageID)) {
            state.upsertMessage(sessionID, {
              info: {
                id: messageID,
                sessionID,
                role: 'assistant',
                time: { created: Date.now() },
              },
              parts: [],
            });
          }
        }

        // Remove messageID/sessionID from the part object
        const { messageID: _mid, sessionID: _sid, ...cleanPart } = part;
        syncStore.getState().upsertPart(messageID, cleanPart as Part);
        break;
      }

      case 'message.part.removed': {
        const { messageID, partID } = props;
        if (messageID && partID) {
          syncStore.getState().removePart(messageID, partID);
        }
        break;
      }

      case 'message.part.delta': {
        const { messageID, partID, sessionID, field, delta } = props;
        if (messageID && partID && sessionID && field && delta) {
          syncStore.getState().appendPartDelta(messageID, partID, sessionID, field, delta);
        }
        break;
      }

      case 'session.status': {
        const { sessionID, status } = props;
        if (sessionID && status) {
          log.log(`📊 [SSE] session.status: ${sessionID} → ${JSON.stringify(status)}`);
          syncStore.getState().setStatus(sessionID, status as SessionStatus);
        }
        break;
      }

      // session.idle is sent when the session finishes processing.
      // Without this, the UI stays in "Working" state forever.
      case 'session.idle': {
        const { sessionID } = props;
        if (sessionID) {
          log.log(`✅ [SSE] session.idle: ${sessionID}`);
          syncStore.getState().setStatus(sessionID, { type: 'idle' });
        }
        break;
      }

      case 'session.created':
        queryClient.invalidateQueries({ queryKey: platformKeys.sessions() });
        break;

      case 'session.updated': {
        // session.updated carries the full Session object — either directly
        // in properties (the session IS the properties) or nested under
        // properties.info. Try both paths.
        const info = props.info || props;
        const sessionID = info?.id || props.sessionID;
        log.log(`📝 [SSE] session.updated: id=${sessionID}, title="${info?.title}", keys=${Object.keys(props).join(',')}`);
        if (sessionID) {
          // Direct cache update with session data (if we have the full object)
          if (info?.title !== undefined) {
            queryClient.setQueryData(platformKeys.session(sessionID), info);
          }
          // Always invalidate both queries to ensure fresh data
          queryClient.invalidateQueries({ queryKey: platformKeys.session(sessionID) });
          queryClient.invalidateQueries({ queryKey: platformKeys.sessions() });
        } else {
          queryClient.invalidateQueries({ queryKey: platformKeys.sessions() });
        }
        break;
      }

      case 'session.deleted': {
        const info = props.info;
        if (info?.id) {
          queryClient.removeQueries({ queryKey: platformKeys.session(info.id) });
        }
        queryClient.invalidateQueries({ queryKey: platformKeys.sessions() });
        break;
      }

      case 'session.compacted': {
        if (props.sessionID) {
          queryClient.invalidateQueries({
            queryKey: platformKeys.sessionMessages(props.sessionID),
          });
          queryClient.invalidateQueries({
            queryKey: platformKeys.session(props.sessionID),
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
        if (props.sessionID) {
          log.error(`❌ [SSE] Session error in ${props.sessionID}:`, props.error);
          // Set status to idle so the UI stops showing "Working"
          syncStore.getState().setStatus(props.sessionID, { type: 'idle' });
        }
        break;

      default:
        log.log(`📨 [SSE] Unhandled event: ${type}`);
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
          const raw = JSON.parse(evt.data);
          // SSE wire format is GlobalEvent: { directory, payload: { type, properties } }
          // Unwrap the payload to get the actual event, matching the web frontend SDK.
          const parsed: SSEEvent =
            raw && typeof raw === 'object' && 'payload' in raw
              ? raw.payload
              : raw;
          if (!parsed?.type) return; // skip heartbeats / malformed
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
