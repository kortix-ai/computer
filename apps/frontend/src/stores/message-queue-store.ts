'use client';

import { create } from 'zustand';

const QUEUE_STORAGE_KEY = 'kortix_message_queue_v1';

function loadStoredMessages(): QueuedMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<
      Pick<QueuedMessage, 'id' | 'sessionId' | 'text' | 'timestamp'>
    >;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && m.id && m.sessionId && typeof m.text === 'string')
      .map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        text: m.text,
        timestamp: Number(m.timestamp) || Date.now(),
      }));
  } catch {
    return [];
  }
}

function persistMessages(messages: QueuedMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Persist only serializable queue data (files stay in-memory only).
    const serializable = messages.map(({ id, sessionId, text, timestamp }) => ({
      id,
      sessionId,
      text,
      timestamp,
    }));
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // no-op
  }
}

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
  /** Whether local queue state is hydrated */
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

  /** Legacy hook for callers; now ensures local hydration state only. */
  hydrateFromBackend: () => Promise<void>;
}

export const useMessageQueueStore = create<MessageQueueState>()((set, get) => ({
  messages: loadStoredMessages(),
  hydrated: true,

  enqueue: (sessionId, text, files) => {
    const message: QueuedMessage = {
      id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      text,
      files,
      timestamp: Date.now(),
    };
    set((state) => {
      const next = [...state.messages, message];
      persistMessages(next);
      return { messages: next };
    });
  },

  remove: (messageId) => {
    set((state) => {
      const next = state.messages.filter((m) => m.id !== messageId);
      persistMessages(next);
      return { messages: next };
    });
  },

  dequeue: (sessionId) => {
    const state = get();
    const sessionMessages = state.messages.filter((m) => m.sessionId === sessionId);
    if (sessionMessages.length === 0) return undefined;
    const first = sessionMessages[0];
    set((s) => ({
      messages: (() => {
        const next = s.messages.filter((m) => m.id !== first.id);
        persistMessages(next);
        return next;
      })(),
    }));
    return first;
  },

  getSessionMessages: (sessionId) => {
    return get().messages.filter((m) => m.sessionId === sessionId);
  },

  moveUp: (messageId) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx <= 0) return state;
      // Find the previous message in the same session
      const msg = state.messages[idx];
      const sessionMessages = state.messages.filter((m) => m.sessionId === msg.sessionId);
      const sessionIdx = sessionMessages.findIndex((m) => m.id === messageId);
      if (sessionIdx <= 0) return state;
      // Swap in the full array
      const prevInSession = sessionMessages[sessionIdx - 1];
      const prevIdx = state.messages.findIndex((m) => m.id === prevInSession.id);
      const next = [...state.messages];
      [next[prevIdx], next[idx]] = [next[idx], next[prevIdx]];
      persistMessages(next);
      return { messages: next };
    });
  },

  moveDown: (messageId) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      const msg = state.messages[idx];
      const sessionMessages = state.messages.filter((m) => m.sessionId === msg.sessionId);
      const sessionIdx = sessionMessages.findIndex((m) => m.id === messageId);
      if (sessionIdx >= sessionMessages.length - 1) return state;
      // Swap in the full array
      const nextInSession = sessionMessages[sessionIdx + 1];
      const nextIdx = state.messages.findIndex((m) => m.id === nextInSession.id);
      const next = [...state.messages];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      persistMessages(next);
      return { messages: next };
    });
  },

  clearSession: (sessionId) => {
    set((state) => {
      const next = state.messages.filter((m) => m.sessionId !== sessionId);
      persistMessages(next);
      return { messages: next };
    });
  },

  hydrateFromBackend: async () => {
    set({ hydrated: true });
  },
}));
