/**
 * Tab store — persists open tabs and navigation history across app restarts.
 *
 * Uses Zustand + AsyncStorage to keep track of:
 * - Open tab IDs (session IDs the user has visited)
 * - Active session ID
 * - Session navigation history (for back/forward)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface TabState {
  /** Currently active session/tab ID */
  activeSessionId: string | null;
  /** List of open tab IDs (session IDs) */
  openTabIds: string[];
  /** Session navigation history (for back/forward) */
  sessionHistory: string[];
  /** Current position in history */
  historyIndex: number;

  navigateToSession: (sessionId: string | null) => void;
  closeTab: (sessionId: string) => void;
  closeAllTabs: () => void;
  goBack: () => void;
  goForward: () => void;
  setShowTabsOverview: (show: boolean) => void;

  /** Whether the tabs overview grid is shown (not persisted) */
  showTabsOverview: boolean;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      activeSessionId: null,
      openTabIds: [],
      sessionHistory: [],
      historyIndex: -1,
      showTabsOverview: false,

      navigateToSession: (sessionId) => {
        set((state) => {
          if (!sessionId) {
            return {
              activeSessionId: null,
              showTabsOverview: false,
            };
          }

          const newOpenTabIds = state.openTabIds.includes(sessionId)
            ? state.openTabIds
            : [...state.openTabIds, sessionId];

          const trimmedHistory = state.sessionHistory.slice(0, state.historyIndex + 1);
          const newHistory = [...trimmedHistory, sessionId];

          return {
            activeSessionId: sessionId,
            showTabsOverview: false,
            openTabIds: newOpenTabIds,
            sessionHistory: newHistory,
            historyIndex: state.historyIndex + 1,
          };
        });
      },

      closeTab: (sessionId) => {
        set((state) => ({
          openTabIds: state.openTabIds.filter((id) => id !== sessionId),
          activeSessionId:
            state.activeSessionId === sessionId ? null : state.activeSessionId,
        }));
      },

      closeAllTabs: () => {
        set({
          openTabIds: [],
          activeSessionId: null,
        });
      },

      goBack: () => {
        const { historyIndex, sessionHistory } = get();
        if (historyIndex <= 0) return;
        const newIndex = historyIndex - 1;
        set({
          historyIndex: newIndex,
          activeSessionId: sessionHistory[newIndex],
        });
      },

      goForward: () => {
        const { historyIndex, sessionHistory } = get();
        if (historyIndex >= sessionHistory.length - 1) return;
        const newIndex = historyIndex + 1;
        set({
          historyIndex: newIndex,
          activeSessionId: sessionHistory[newIndex],
        });
      },

      setShowTabsOverview: (show) => {
        set({ showTabsOverview: show });
      },
    }),
    {
      name: 'kortix-tab-state',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        openTabIds: state.openTabIds,
        sessionHistory: state.sessionHistory,
        historyIndex: state.historyIndex,
        // Note: showTabsOverview is intentionally NOT persisted
      }),
    },
  ),
);
