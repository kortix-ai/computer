'use client';

import { useEffect, useRef } from 'react';
import { useSyncStore, type MessageWithParts } from '@/stores/opencode-sync-store';
import { getClient } from '@/lib/opencode-sdk';
import type { SessionStatus, PermissionRequest, QuestionRequest, FileDiff, Todo, Message, Part } from '@kortix/opencode-sdk/v2/client';

const EMPTY_MESSAGES: MessageWithParts[] = [];
const EMPTY_PERMS: PermissionRequest[] = [];
const EMPTY_QUES: QuestionRequest[] = [];
const EMPTY_DIFFS: FileDiff[] = [];
const EMPTY_TODOS: Todo[] = [];
const IDLE_STATUS = { type: 'idle' } as SessionStatus;

/**
 * Build MessageWithParts[] with reference caching.
 * Returns the same array reference if nothing relevant changed.
 * This is a module-level cache keyed by sessionId so multiple components
 * using the same sessionId share the cache (e.g. SessionLayout + SessionChat).
 */
const messageCache = new Map<string, {
  msgs: Message[] | undefined;
  partRefs: (Part[] | undefined)[];
  result: MessageWithParts[];
}>();

function buildMessages(sessionId: string, msgs: Message[] | undefined, parts: Record<string, Part[]>): MessageWithParts[] {
  if (!msgs || msgs.length === 0) return EMPTY_MESSAGES;

  const cached = messageCache.get(sessionId);
  if (cached && cached.msgs === msgs) {
    // Same message array — check if any part arrays changed
    let same = cached.partRefs.length === msgs.length;
    if (same) {
      for (let i = 0; i < msgs.length; i++) {
        if (parts[msgs[i].id] !== cached.partRefs[i]) { same = false; break; }
      }
    }
    if (same) return cached.result;
  }

  // Rebuild
  const partRefs: (Part[] | undefined)[] = [];
  const result: MessageWithParts[] = [];
  for (const info of msgs) {
    const pa = parts[info.id];
    partRefs.push(pa);
    result.push({ info, parts: pa ?? [] });
  }
  messageCache.set(sessionId, { msgs, partRefs, result });
  return result;
}

/**
 * Single hook that provides all session data from the sync store.
 * Replaces: useOpenCodeMessages + useOpenCodeSessionStatusStore + useOpenCodePendingStore
 *
 * On first access, fetches messages from the server and populates the store.
 * After that, SSE events keep the store updated in real time.
 */
export function useSessionSync(sessionId: string) {
  const fetchedRef = useRef<string | null>(null);

  // Fetch messages on first access (or session change)
  useEffect(() => {
    if (!sessionId) return;
    if (fetchedRef.current === sessionId) return;
    fetchedRef.current = sessionId;

    const store = useSyncStore.getState();
    if (store.messages[sessionId]?.length) return;

    getClient().session.messages({ sessionID: sessionId }).then((res) => {
      if (res.data) useSyncStore.getState().hydrate(sessionId, res.data as any);
    }).catch(() => {});
  }, [sessionId]);

  // Single selector that derives MessageWithParts[] with reference caching.
  // The buildMessages function returns the same array reference if nothing
  // relevant to this session changed — preventing unnecessary re-renders.
  const messages = useSyncStore((s) =>
    buildMessages(sessionId, s.messages[sessionId], s.parts),
  );

  const status = useSyncStore((s) => s.sessionStatus[sessionId] ?? IDLE_STATUS) as SessionStatus;
  const permissions = useSyncStore((s) => s.permissions[sessionId]) as PermissionRequest[] | undefined;
  const questions = useSyncStore((s) => s.questions[sessionId]) as QuestionRequest[] | undefined;
  const diffs = useSyncStore((s) => s.diffs[sessionId]) as FileDiff[] | undefined;
  const todos = useSyncStore((s) => s.todos[sessionId]) as Todo[] | undefined;

  const isBusy = status?.type === 'busy' || status?.type === 'retry';
  const isLoading = !useSyncStore((s) => sessionId in (s.messages));

  return {
    messages,
    status,
    isBusy,
    isLoading,
    permissions: permissions ?? EMPTY_PERMS,
    questions: questions ?? EMPTY_QUES,
    diffs: diffs ?? EMPTY_DIFFS,
    todos: todos ?? EMPTY_TODOS,
  };
}
