'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncStore } from '@/stores/opencode-sync-store';
import { useDiagnosticsStore } from '@/stores/diagnostics-store';
import { useServerStore } from '@/stores/server-store';
import { getClient, resetClient } from '@/lib/opencode-sdk';
import { logger } from '@/lib/logger';
import {
  notifySessionError,
  notifyQuestion,
  notifyPermissionRequest,
  notifyTaskComplete,
} from '@/lib/web-notifications';
import { opencodeKeys } from './use-opencode-sessions';
import { ptyKeys } from './use-opencode-pty';
import type { Event as OpenCodeEvent, Part } from '@kortix/opencode-sdk/v2/client';

/**
 * Connects to OpenCode's SSE event stream and routes ALL events through
 * the single sync store. No React Query for messages/status/permissions/questions.
 *
 * React Query is only invalidated for low-frequency data (sessions list,
 * agents, providers, LSP, MCP, PTY).
 */
export function useOpenCodeEventStream() {
  const queryClient = useQueryClient();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const abortRef = useRef<AbortController | null>(null);
  const prevServerVersionRef = useRef(serverVersion);

  useEffect(() => {
    const isServerSwitch = prevServerVersionRef.current !== serverVersion;
    prevServerVersionRef.current = serverVersion;

    if (isServerSwitch) {
      resetClient();
      useSyncStore.getState().reset();
      useDiagnosticsStore.getState().clearAll();
      queryClient.removeQueries({ queryKey: opcodeKeys.all });
    }

    const client = getClient();
    const store = useSyncStore.getState();

    // Hydrate pending permissions & questions on connect
    client.permission.list().then((res) => {
      if (res.data) (res.data as any[]).forEach((p) => store.addPermission(p));
    }).catch((err) => {
      logger.error('Failed to hydrate permissions', { error: String(err) });
    });

    client.question.list().then((res) => {
      if (res.data) (res.data as any[]).forEach((q) => store.addQuestion(q));
    }).catch((err) => {
      logger.error('Failed to hydrate questions', { error: String(err) });
    });

    // SSE connection with event coalescing (16ms frame batching)
    const abortController = new AbortController();
    abortRef.current = abortController;

    let queue: ({ type: string; event: OpenCodeEvent } | undefined)[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFlush = 0;
    const coalesced = new Map<string, number>();

    function getCoalesceKey(event: OpenCodeEvent): string | undefined {
      if (event.type === 'message.part.updated') {
        const part = (event.properties as any)?.part;
        return `message.part.updated:${part?.messageID}:${part?.id}`;
      }
      if (event.type === 'lsp.updated') return 'lsp.updated';
      // NOTE: message.part.delta is NOT coalesced — every delta must be applied
      return undefined;
    }

    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = undefined;
      if (queue.length === 0) return;
      const events = queue;
      queue = [];
      coalesced.clear();
      lastFlush = Date.now();
      for (const item of events) {
        if (!item) continue;
        handleEvent(item.event);
      }
    };

    const schedule = () => {
      if (flushTimer) return;
      const elapsed = Date.now() - lastFlush;
      flushTimer = setTimeout(flush, Math.max(0, 16 - elapsed));
    };

    // Consume SSE stream with automatic retry
    (async () => {
      let retryCount = 0;
      while (!abortController.signal.aborted) {
        try {
          const result = await client.event.subscribe(undefined, {
            signal: abortController.signal,
            sseDefaultRetryDelay: 3000,
            sseMaxRetryDelay: 30000,
          } as any);
          const { stream } = result;

          // On reconnect, refresh low-frequency React Query data
          if (retryCount > 0) {
            queryClient.refetchQueries({ queryKey: opcodeKeys.all });
          }
          retryCount = 0;

          for await (const event of stream) {
            if (abortController.signal.aborted) break;
            const e = event as OpenCodeEvent;
            const ck = getCoalesceKey(e);
            if (ck) {
              const existing = coalesced.get(ck);
              if (existing !== undefined) queue[existing] = undefined;
              coalesced.set(ck, queue.length);
            }
            queue.push({ type: (e as any).type, event: e });
            schedule();
          }
        } catch (err) {
          if (abortController.signal.aborted) break;
          logger.error('SSE event stream error', { error: String(err), retryCount });
        } finally {
          flush();
        }

        if (abortController.signal.aborted) break;
        retryCount++;
        logger.warn('SSE event stream reconnecting', { retryCount });
        const delay = Math.min(1000 * Math.pow(2, Math.min(retryCount, 5)), 30000);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          const onAbort = () => { clearTimeout(timer); resolve(); };
          abortController.signal.addEventListener('abort', onAbort, { once: true });
        });
      }
    })();

    // Helper: session title for notifications
    function getSessionTitle(sessionID: string): string | undefined {
      const sessions = queryClient.getQueryData<any[]>(opencodeKeys.sessions());
      if (sessions) {
        const s = sessions.find((x: any) => x.id === sessionID);
        if (s?.title) return s.title;
      }
      return queryClient.getQueryData<any>(opencodeKeys.session(sessionID))?.title;
    }

    function handleEvent(event: OpenCodeEvent) {
      const syncStore = useSyncStore.getState();

      // Route ALL high-frequency events through the sync store
      syncStore.applyEvent(event);

      // Additional side effects per event type
      switch (event.type) {
        // ---- Notifications for status transitions ----
        case 'session.status': {
          const { sessionID, status } = event.properties as any;
          if (sessionID && status?.type === 'idle') {
            // Check if this was a busy→idle transition (notification)
            // The store was already updated by applyEvent above, so check the
            // previous status. We track it here via a simple approach:
            // If we just set idle, and the session had any previous status, notify.
            notifyTaskComplete(sessionID, getSessionTitle(sessionID));
          }
          break;
        }
        case 'session.idle': {
          const sessionID = (event.properties as any).sessionID;
          if (sessionID) notifyTaskComplete(sessionID, getSessionTitle(sessionID));
          break;
        }

        // ---- Session errors ----
        case 'session.error': {
          const props = event.properties as { sessionID?: string; error?: any };
          if (props.sessionID && props.error) {
            const errorTitle = props.error?.name || props.error?.data?.message || 'An error occurred';
            notifySessionError(props.sessionID, errorTitle, getSessionTitle(props.sessionID));

            // Patch error onto last assistant message in sync store
            const messages = syncStore.messages[props.sessionID];
            if (messages) {
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant') {
                  if ((messages[i] as any).error) break;
                  syncStore.upsertMessage(props.sessionID, {
                    ...messages[i],
                    error: props.error,
                  } as any);
                  break;
                }
              }
            }
          }
          break;
        }

        // ---- Permission/question notifications ----
        case 'permission.asked': {
          const props = event.properties as any;
          if (props.sessionID) {
            const toolName = props.tool || props.type || 'a tool';
            notifyPermissionRequest(props.sessionID, toolName, getSessionTitle(props.sessionID));
          }
          break;
        }
        case 'question.asked': {
          const props = event.properties as any;
          if (props.sessionID) {
            const questionText = props.questions?.[0]?.question || props.questions?.[0]?.header || 'Kortix needs your input';
            notifyQuestion(props.sessionID, questionText, getSessionTitle(props.sessionID));
          }
          break;
        }

        // ---- Diagnostics from message.part.updated ----
        case 'message.part.updated': {
          const part = (event.properties as any).part as Part;
          const partMeta = (part as any)?.metadata;
          if (partMeta?.diagnostics && typeof partMeta.diagnostics === 'object') {
            const diagsByFile = partMeta.diagnostics as Record<string, any[]>;
            const validEntries: Record<string, any[]> = {};
            let hasValid = false;
            for (const [file, diags] of Object.entries(diagsByFile)) {
              if (Array.isArray(diags) && diags.length > 0) {
                validEntries[file] = diags;
                hasValid = true;
              }
            }
            if (hasValid) useDiagnosticsStore.getState().setFromLspEvent(validEntries);
          }
          break;
        }

        // ---- Low-frequency: invalidate React Query ----
        case 'session.created':
        case 'session.updated':
        case 'session.deleted': {
          queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
          const sessionID = (event.properties as any)?.info?.id;
          if (sessionID) queryClient.invalidateQueries({ queryKey: opencodeKeys.session(sessionID) });
          break;
        }
        case 'session.compacted': {
          const sessionID = (event.properties as any).sessionID;
          if (sessionID) {
            // Refetch messages into sync store after compaction
            client.session.messages({ sessionID }).then((res) => {
              if (res.data) useSyncStore.getState().hydrate(sessionID, res.data as any);
            }).catch(() => {});
            queryClient.invalidateQueries({ queryKey: opencodeKeys.session(sessionID) });
          }
          break;
        }
        case 'vcs.branch.updated': {
          queryClient.setQueryData(['opencode', 'vcs'], { branch: (event.properties as any).branch });
          break;
        }
        case 'server.instance.disposed': {
          queryClient.invalidateQueries({ queryKey: opcodeKeys.all });
          break;
        }
        case 'lsp.updated': {
          queryClient.invalidateQueries({ queryKey: ['opencode', 'lsp'] });
          const lspProps = event.properties as Record<string, unknown>;
          if (lspProps) {
            const diagEntries: Record<string, any[]> = {};
            let hasDiags = false;
            for (const [key, value] of Object.entries(lspProps)) {
              if (Array.isArray(value)) { diagEntries[key] = value; hasDiags = true; }
            }
            if (hasDiags) useDiagnosticsStore.getState().setFromLspEvent(diagEntries);
          }
          break;
        }
        case 'lsp.client.diagnostics': {
          const diagProps = event.properties as Record<string, unknown>;
          const diagPath = diagProps?.path as string | undefined;
          if (diagPath) {
            const diagnostics = diagProps?.diagnostics;
            if (Array.isArray(diagnostics)) {
              useDiagnosticsStore.getState().setFromLspEvent({ [diagPath]: diagnostics });
            }
          }
          break;
        }
        case 'mcp.tools.changed': {
          queryClient.invalidateQueries({ queryKey: opencodeKeys.mcpStatus() });
          queryClient.invalidateQueries({ queryKey: opencodeKeys.toolIds() });
          break;
        }
        case 'pty.created':
        case 'pty.updated':
        case 'pty.exited':
        case 'pty.deleted': {
          queryClient.invalidateQueries({ queryKey: ptyKeys.listPrefix() });
          break;
        }
        default:
          break;
      }
    }

    return () => {
      abortController.abort();
      abortRef.current = null;
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [queryClient, serverVersion]);
}

const opcodeKeys = opencodeKeys;
