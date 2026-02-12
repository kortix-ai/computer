'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOpenCodeSessionStatusStore } from '@/stores/opencode-session-status-store';
import { useOpenCodePendingStore } from '@/stores/opencode-pending-store';
import { useServerStore } from '@/stores/server-store';
import { getClient, resetClient } from '@/lib/opencode-sdk';
import { opencodeKeys } from './use-opencode-sessions';
import { ptyKeys } from './use-opencode-pty';
import type { Event as OpenCodeEvent, Message, Part } from '@kortix/opencode-sdk/v2/client';
import type { MessageWithParts } from './use-opencode-sessions';

/**
 * Connects to OpenCode's SSE event stream via the SDK and
 * performs INCREMENTAL cache updates on React Query data.
 *
 * Instead of invalidating queries (which triggers full refetches),
 * we use setQueryData to surgically update messages, parts, sessions, etc.
 * This matches the SolidJS reference implementation's approach.
 */
export function useOpenCodeEventStream() {
  const queryClient = useQueryClient();
  const setStatus = useOpenCodeSessionStatusStore((s) => s.setStatus);
  const clearStatuses = useOpenCodeSessionStatusStore((s) => s.setStatuses);
  const addPermission = useOpenCodePendingStore((s) => s.addPermission);
  const removePermission = useOpenCodePendingStore((s) => s.removePermission);
  const addQuestion = useOpenCodePendingStore((s) => s.addQuestion);
  const removeQuestion = useOpenCodePendingStore((s) => s.removeQuestion);
  const clearPending = useOpenCodePendingStore((s) => s.clear);
  const serverVersion = useServerStore((s) => s.serverVersion);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // On every server change: nuke all opencode caches, clear session statuses, clear pending
    resetClient();
    clearStatuses({});
    clearPending();
    queryClient.removeQueries({ queryKey: opcodeKeys.all });

    const client = getClient();

    // Hydrate pending permissions & questions from server on connect
    client.permission.list().then((res) => {
      if (res.data) (res.data as any[]).forEach(addPermission);
    }).catch(() => {});

    client.question.list().then((res) => {
      if (res.data) (res.data as any[]).forEach(addQuestion);
    }).catch(() => {});

    // Set up SSE via the SDK's AsyncGenerator
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Event coalescing queue (like the SolidJS reference)
    let queue: ({ type: string; event: OpenCodeEvent } | undefined)[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFlush = 0;

    // Coalescing map — replaces earlier events of the same key
    const coalesced = new Map<string, number>();

    function getCoalesceKey(event: OpenCodeEvent): string | undefined {
      if (event.type === 'session.status') {
        return `session.status:${(event.properties as any)?.sessionID}`;
      }
      if (event.type === 'message.part.updated') {
        const part = (event.properties as any)?.part;
        return `message.part.updated:${part?.messageID}:${part?.id}`;
      }
      if (event.type === 'lsp.updated') return 'lsp.updated';
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

    // Consume the stream in the background
    (async () => {
      try {
        const result = await client.event.subscribe(undefined, {
          signal: abortController.signal,
          sseDefaultRetryDelay: 3000,
          sseMaxRetryDelay: 30000,
        } as any);
        const { stream } = result;
        for await (const event of stream) {
          if (abortController.signal.aborted) break;
          const e = event as OpenCodeEvent;
          const ck = getCoalesceKey(e);
          if (ck) {
            const existing = coalesced.get(ck);
            if (existing !== undefined) {
              queue[existing] = undefined; // null out old entry
            }
            coalesced.set(ck, queue.length);
          }
          queue.push({ type: (e as any).type, event: e });
          schedule();
        }
      } catch {
        // Stream ended or aborted — expected on cleanup
      } finally {
        flush();
      }
    })();

    function handleEvent(event: OpenCodeEvent) {
      switch (event.type) {
        // ---- Message events (INCREMENTAL) ----
        case 'message.updated': {
          const info = (event.properties as any).info as Message;
          if (!info?.sessionID) break;
          updateMessageInCache(info);
          break;
        }

        case 'message.removed': {
          const props = event.properties as { sessionID: string; messageID: string };
          if (!props.sessionID || !props.messageID) break;
          removeMessageFromCache(props.sessionID, props.messageID);
          break;
        }

        case 'message.part.updated': {
          const part = (event.properties as any).part as Part;
          if (!part?.sessionID || !part?.messageID) break;
          updatePartInCache(part);
          break;
        }

        case 'message.part.removed': {
          const props = event.properties as { sessionID?: string; messageID: string; partID: string };
          if (!props.messageID || !props.partID) break;
          removePartFromCache(props.messageID, props.partID, (props as any).sessionID);
          break;
        }

        // ---- Session lifecycle ----
        case 'session.created':
        case 'session.updated':
        case 'session.deleted': {
          // For sessions, just invalidate — the list is small and needs sorting
          queryClient.invalidateQueries({ queryKey: opencodeKeys.sessions() });
          const sessionID = (event.properties as any)?.info?.id;
          if (sessionID) {
            queryClient.invalidateQueries({ queryKey: opencodeKeys.session(sessionID) });
          }
          break;
        }

        case 'session.compacted': {
          const sessionID = (event.properties as any).sessionID;
          if (sessionID) {
            // Full refetch after compaction since messages changed significantly
            queryClient.invalidateQueries({ queryKey: opencodeKeys.messages(sessionID) });
          }
          break;
        }

        // ---- Session status ----
        case 'session.status': {
          const { sessionID, status } = event.properties as any;
          if (sessionID && status) {
            setStatus(sessionID, status);
          }
          break;
        }

        case 'session.idle': {
          const sessionID = (event.properties as any).sessionID;
          if (sessionID) {
            setStatus(sessionID, { type: 'idle' });
          }
          break;
        }

        // ---- Permissions ----
        case 'permission.asked': {
          const props = event.properties as any;
          if (props.id && props.sessionID) {
            addPermission(props);
          }
          break;
        }
        case 'permission.replied': {
          const requestID = (event.properties as any).requestID;
          if (requestID) removePermission(requestID);
          break;
        }

        // ---- Questions ----
        case 'question.asked': {
          const props = event.properties as any;
          if (props.id && props.sessionID) {
            addQuestion(props);
          }
          break;
        }
        case 'question.replied':
        case 'question.rejected': {
          const requestID = (event.properties as any).requestID;
          if (requestID) removeQuestion(requestID);
          break;
        }

        // ---- Session diff ----
        case 'session.diff': {
          const props = event.properties as { sessionID: string; diff: any[] };
          if (props.sessionID) {
            queryClient.setQueryData(['opencode', 'session-diff', props.sessionID], props.diff);
          }
          break;
        }

        // ---- Todo updated ----
        case 'todo.updated': {
          const props = event.properties as { sessionID: string; todos: any[] };
          if (props.sessionID) {
            queryClient.setQueryData(['opencode', 'session-todo', props.sessionID], props.todos);
          }
          break;
        }

        // ---- VCS branch ----
        case 'vcs.branch.updated': {
          const props = event.properties as { branch: string };
          queryClient.setQueryData(['opencode', 'vcs'], { branch: props.branch });
          break;
        }

        // ---- Server disposed ----
        case 'server.instance.disposed': {
          // Full refresh of all data
          queryClient.invalidateQueries({ queryKey: opcodeKeys.all });
          break;
        }

        // ---- LSP updated ----
        case 'lsp.updated': {
          queryClient.invalidateQueries({ queryKey: ['opencode', 'lsp'] });
          break;
        }

        // ---- PTY events ----
        case 'pty.created':
        case 'pty.updated':
        case 'pty.exited':
        case 'pty.deleted': {
          queryClient.invalidateQueries({ queryKey: ptyKeys.list() });
          break;
        }

        default:
          break;
      }
    }

    // ---- Incremental cache update helpers ----

    function updateMessageInCache(info: Message) {
      const key = opencodeKeys.messages(info.sessionID);
      queryClient.setQueryData<MessageWithParts[]>(key, (old) => {
        if (!old) {
          // Initialize cache with this message so SSE events arriving before
          // the React Query fetch completes are not silently dropped.
          return [{ info: info as any, parts: [] }];
        }
        const idx = old.findIndex((m) => m.info.id === info.id);
        if (idx >= 0) {
          // Update existing message info, keep parts
          const updated = [...old];
          updated[idx] = { ...updated[idx], info: info as any };
          return updated;
        }
        // Insert new message — find correct sorted position by id
        const newMsg: MessageWithParts = { info: info as any, parts: [] };
        const next = [...old, newMsg];
        next.sort((a, b) => a.info.id.localeCompare(b.info.id));
        return next;
      });
    }

    function removeMessageFromCache(sessionID: string, messageID: string) {
      const key = opencodeKeys.messages(sessionID);
      queryClient.setQueryData<MessageWithParts[]>(key, (old) => {
        if (!old) return old;
        return old.filter((m) => m.info.id !== messageID);
      });
    }

    function updatePartInCache(part: Part) {
      // Find which session this message belongs to — use the part's sessionID
      const sessionID = part.sessionID;
      if (!sessionID) return;

      const key = opencodeKeys.messages(sessionID);
      queryClient.setQueryData<MessageWithParts[]>(key, (old) => {
        if (!old) {
          // Cache not yet initialized — create a stub message entry so the part
          // is preserved. The full message info will be patched by a later
          // message.updated event or the React Query fetch.
          return [{
            info: { id: part.messageID, sessionID, role: 'assistant' } as any,
            parts: [part as any],
          }];
        }
        const msgIdx = old.findIndex((m) => m.info.id === part.messageID);
        if (msgIdx < 0) {
          // Message not yet in cache — create a stub entry for it
          const newMsg: MessageWithParts = {
            info: { id: part.messageID, sessionID, role: 'assistant' } as any,
            parts: [part as any],
          };
          const next = [...old, newMsg];
          next.sort((a, b) => a.info.id.localeCompare(b.info.id));
          return next;
        }

        const updated = [...old];
        const msg = { ...updated[msgIdx] };
        const parts = [...msg.parts];

        const partIdx = parts.findIndex((p) => p.id === part.id);
        if (partIdx >= 0) {
          // Update existing part
          parts[partIdx] = part as any;
        } else {
          // Insert new part — sorted by id
          parts.push(part as any);
          parts.sort((a, b) => a.id.localeCompare(b.id));
        }

        msg.parts = parts;
        updated[msgIdx] = msg;
        return updated;
      });
    }

    function removePartFromCache(messageID: string, partID: string, sessionID?: string) {
      // We need to find which session this message belongs to
      // If sessionID is provided, use it directly
      if (sessionID) {
        const key = opencodeKeys.messages(sessionID);
        queryClient.setQueryData<MessageWithParts[]>(key, (old) => {
          if (!old) return old;
          const msgIdx = old.findIndex((m) => m.info.id === messageID);
          if (msgIdx < 0) return old;

          const updated = [...old];
          const msg = { ...updated[msgIdx] };
          msg.parts = msg.parts.filter((p) => p.id !== partID);
          updated[msgIdx] = msg;
          return updated;
        });
      }
    }

    return () => {
      abortController.abort();
      abortRef.current = null;
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [queryClient, setStatus, clearStatuses, addPermission, removePermission, addQuestion, removeQuestion, clearPending, serverVersion]);
}

// Use the correct key reference
const opcodeKeys = opencodeKeys;
