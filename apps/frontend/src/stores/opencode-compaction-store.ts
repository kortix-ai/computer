'use client';

import { create } from 'zustand';

interface OpenCodeCompactionState {
  compactingBySession: Record<string, boolean>;
  startCompaction: (sessionId: string) => void;
  stopCompaction: (sessionId: string) => void;
}

export const useOpenCodeCompactionStore = create<OpenCodeCompactionState>()((set) => ({
  compactingBySession: {},

  startCompaction: (sessionId) =>
    set((state) => ({
      compactingBySession: { ...state.compactingBySession, [sessionId]: true },
    })),

  stopCompaction: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.compactingBySession;
      return { compactingBySession: rest };
    }),
}));
