'use client';

import { create } from 'zustand';

/** Lightweight file reference for queued messages (mirrors AttachedFile from session-chat-input) */
interface QueuedFile {
  file: File;
  localUrl: string;
  isImage: boolean;
}

interface QueuedMessage {
  id: string;
  sessionId: string;
  text: string;
  files?: QueuedFile[];
  timestamp: number;
}

interface MessageQueueState {
  messages: QueuedMessage[];

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
}

export const useMessageQueueStore = create<MessageQueueState>()((set, get) => ({
  messages: [],

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
  },

  remove: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
  },

  dequeue: (sessionId) => {
    const state = get();
    const sessionMessages = state.messages.filter((m) => m.sessionId === sessionId);
    if (sessionMessages.length === 0) return undefined;
    const first = sessionMessages[0];
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== first.id),
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
      return { messages: next };
    });
  },

  clearSession: (sessionId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.sessionId !== sessionId),
    }));
  },
}));
