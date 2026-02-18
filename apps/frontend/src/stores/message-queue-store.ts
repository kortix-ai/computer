'use client';

import { create } from 'zustand';
import {
  persistEnqueue,
  persistRemove,
  persistMoveUp,
  persistMoveDown,
  persistClearSession,
  fetchAllQueues,
} from '@/lib/api/queue';

/** Lightweight file reference for queued messages (mirrors AttachedFile from session-chat-input) */
export interface QueuedFile {
  file: File;
  localUrl: string;
  isImage: boolean;
}

export interface QueuedMessage {
  id: string;
  sessionId: string;
  text: string;
  files?: QueuedFile[];
  timestamp: number;
}

interface MessageQueueState {
  messages: QueuedMessage[];
  /** Whether the initial hydration from the backend has completed */
  hydrated: boolean;

  /** Add a message to the queue for a given session */
  enqueue: (sessionId: string, text: string, files?: QueuedFile[]) => void;

  /** Remove a specific message from the queue by ID */
  remove: (messageId: string) => void;

  /** Remove and return the first message in the queue for a session */
  dequeue: (sessionId: string) => QueuedMessage | undefined;

  /** Get all queued messages for a specific session */
  getSessionMessages: (sessionId: string) => QueuedMessage[];

  /** Move a message up in the queue (swap with previous) */
  moveUp: (messageId: string) => void;

  /** Move a message down in the queue (swap with next) */
  moveDown: (messageId: string) => void;

  /** Clear all messages for a session */
  clearSession: (sessionId: string) => void;

  /**
   * Hydrate the store from the backend. Called once on app load.
   * Merges backend messages with any that might already be in the
   * in-memory store (e.g. from a quick re-render).
   */
  hydrateFromBackend: () => Promise<void>;
}

export const useMessageQueueStore = create<MessageQueueState>()((set, get) => ({
  messages: [],
  hydrated: false,

  enqueue: (sessionId, text, files) => {
    const message: QueuedMessage = {
      id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      text,
      files,
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: [...state.messages, message],
    }));
    // Persist to backend (fire-and-forget)
    void persistEnqueue(sessionId, text, message.id).catch(() => {
      // Silent — backend sync is best-effort
    });
  },

  remove: (messageId) => {
    const msg = get().messages.find((m) => m.id === messageId);
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
    // Persist to backend
    void persistRemove(messageId, msg?.sessionId).catch(() => {});
  },

  dequeue: (sessionId) => {
    const state = get();
    const sessionMessages = state.messages.filter((m) => m.sessionId === sessionId);
    if (sessionMessages.length === 0) return undefined;
    const first = sessionMessages[0];
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== first.id),
    }));
    // Persist removal to backend
    void persistRemove(first.id, sessionId).catch(() => {});
    return first;
  },

  getSessionMessages: (sessionId) => {
    return get().messages.filter((m) => m.sessionId === sessionId);
  },

  moveUp: (messageId) => {
    let sessionId: string | undefined;
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx <= 0) return state;
      // Find the previous message in the same session
      const msg = state.messages[idx];
      sessionId = msg.sessionId;
      const sessionMessages = state.messages.filter((m) => m.sessionId === msg.sessionId);
      const sessionIdx = sessionMessages.findIndex((m) => m.id === messageId);
      if (sessionIdx <= 0) return state;
      // Swap in the full array
      const prevInSession = sessionMessages[sessionIdx - 1];
      const prevIdx = state.messages.findIndex((m) => m.id === prevInSession.id);
      const next = [...state.messages];
      [next[prevIdx], next[idx]] = [next[idx], next[prevIdx]];
      return { messages: next };
    });
    // Persist to backend
    if (sessionId) {
      void persistMoveUp(messageId, sessionId).catch(() => {});
    }
  },

  moveDown: (messageId) => {
    let sessionId: string | undefined;
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      const msg = state.messages[idx];
      sessionId = msg.sessionId;
      const sessionMessages = state.messages.filter((m) => m.sessionId === msg.sessionId);
      const sessionIdx = sessionMessages.findIndex((m) => m.id === messageId);
      if (sessionIdx >= sessionMessages.length - 1) return state;
      // Swap in the full array
      const nextInSession = sessionMessages[sessionIdx + 1];
      const nextIdx = state.messages.findIndex((m) => m.id === nextInSession.id);
      const next = [...state.messages];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return { messages: next };
    });
    // Persist to backend
    if (sessionId) {
      void persistMoveDown(messageId, sessionId).catch(() => {});
    }
  },

  clearSession: (sessionId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.sessionId !== sessionId),
    }));
    // Persist to backend
    void persistClearSession(sessionId).catch(() => {});
  },

  hydrateFromBackend: async () => {
    try {
      const backendMessages = await fetchAllQueues();
      if (backendMessages.length === 0) {
        set({ hydrated: true });
        return;
      }
      set((state) => {
        // Merge: backend messages that aren't already in-memory
        const existingIds = new Set(state.messages.map((m) => m.id));
        const newMessages: QueuedMessage[] = backendMessages
          .filter((bm) => !existingIds.has(bm.id))
          .map((bm) => ({
            id: bm.id,
            sessionId: bm.sessionId,
            text: bm.text,
            timestamp: bm.timestamp,
            // No files — can't persist File objects across reloads
          }));
        return {
          messages: [...newMessages, ...state.messages],
          hydrated: true,
        };
      });
    } catch {
      // If backend is unreachable, just mark as hydrated with current state
      set({ hydrated: true });
    }
  },
}));
