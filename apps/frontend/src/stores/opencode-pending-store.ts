'use client';

/**
 * Compatibility re-export — the real data lives in opencode-sync-store.
 *
 * Old shape: permissions/questions as Record<requestID, Request>
 * Sync store: permissions/questions as Record<sessionID, Request[]>
 *
 * We store a cached flattened version to avoid infinite re-render loops.
 */
import { useSyncStore } from './opencode-sync-store';
import type { PermissionRequest, QuestionRequest } from '@kortix/opencode-sdk/v2/client';

interface OpenCodePendingState {
  permissions: Record<string, PermissionRequest>;
  questions: Record<string, QuestionRequest>;
  removePermission: (requestId: string) => void;
  removeQuestion: (requestId: string) => void;
}

// Cached flattened versions — rebuilt when the source map reference changes
let cachedPermsSource: Record<string, PermissionRequest[]> | null = null;
let cachedPermsFlat: Record<string, PermissionRequest> = {};
let cachedQuesSource: Record<string, QuestionRequest[]> | null = null;
let cachedQuesFlat: Record<string, QuestionRequest> = {};

function getFlatPermissions(perSession: Record<string, PermissionRequest[]>): Record<string, PermissionRequest> {
  if (perSession === cachedPermsSource) return cachedPermsFlat;
  cachedPermsSource = perSession;
  const flat: Record<string, PermissionRequest> = {};
  for (const arr of Object.values(perSession)) {
    for (const p of arr) flat[p.id] = p;
  }
  cachedPermsFlat = flat;
  return flat;
}

function getFlatQuestions(perSession: Record<string, QuestionRequest[]>): Record<string, QuestionRequest> {
  if (perSession === cachedQuesSource) return cachedQuesFlat;
  cachedQuesSource = perSession;
  const flat: Record<string, QuestionRequest> = {};
  for (const arr of Object.values(perSession)) {
    for (const q of arr) flat[q.id] = q;
  }
  cachedQuesFlat = flat;
  return flat;
}

export function useOpenCodePendingStore<T>(selector: (state: OpenCodePendingState) => T): T {
  return useSyncStore((s) => {
    const state: OpenCodePendingState = {
      permissions: getFlatPermissions(s.permissions),
      questions: getFlatQuestions(s.questions),
      removePermission: (requestId) => {
        for (const [sid, perms] of Object.entries(s.permissions)) {
          if (perms.some((p) => p.id === requestId)) {
            s.removePermission(sid, requestId);
            return;
          }
        }
      },
      removeQuestion: (requestId) => {
        for (const [sid, qs] of Object.entries(s.questions)) {
          if (qs.some((q) => q.id === requestId)) {
            s.removeQuestion(sid, requestId);
            return;
          }
        }
      },
    };
    return selector(state);
  });
}

// Static access
useOpenCodePendingStore.getState = (): OpenCodePendingState => {
  const s = useSyncStore.getState();
  return {
    permissions: getFlatPermissions(s.permissions),
    questions: getFlatQuestions(s.questions),
    removePermission: (requestId) => {
      for (const [sid, perms] of Object.entries(s.permissions)) {
        if (perms.some((p) => p.id === requestId)) {
          s.removePermission(sid, requestId);
          return;
        }
      }
    },
    removeQuestion: (requestId) => {
      for (const [sid, qs] of Object.entries(s.questions)) {
        if (qs.some((q) => q.id === requestId)) {
          s.removeQuestion(sid, requestId);
          return;
        }
      }
    },
  };
};
