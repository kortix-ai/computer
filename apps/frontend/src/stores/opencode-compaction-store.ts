'use client';

import { create } from 'zustand';

type CompactionState = {
  compactingBySession: Record<string, boolean>;
  startCompaction: (sessionId: string) => void;
  stopCompaction: (sessionId: string) => void;
  clear: () => void;
};

export const useOpenCodeCompactionStore = create<CompactionState>((set) => ({
  compactingBySession: {},
  startCompaction: (sessionId) =>
    set((state) => ({
      compactingBySession: {
        ...state.compactingBySession,
        [sessionId]: true,
      },
    })),
  stopCompaction: (sessionId) =>
    set((state) => {
      const next = { ...state.compactingBySession };
      delete next[sessionId];
      return { compactingBySession: next };
    }),
  clear: () => set({ compactingBySession: {} }),
}));
