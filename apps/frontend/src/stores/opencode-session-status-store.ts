'use client';

import { create } from 'zustand';
import type { OpenCodeSessionStatus } from '@/lib/api/opencode';

interface OpenCodeSessionStatusState {
  statuses: Record<string, OpenCodeSessionStatus>;
  setStatus: (sessionId: string, status: OpenCodeSessionStatus) => void;
  setStatuses: (statuses: Record<string, OpenCodeSessionStatus>) => void;
}

export const useOpenCodeSessionStatusStore = create<OpenCodeSessionStatusState>()((set) => ({
  statuses: {},
  setStatus: (sessionId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [sessionId]: status },
    })),
  setStatuses: (statuses) => set({ statuses }),
}));
