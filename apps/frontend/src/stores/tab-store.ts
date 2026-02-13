'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type TabType = 'session' | 'file' | 'dashboard' | 'settings' | 'project' | 'page' | 'preview' | 'terminal';

export interface Tab {
  /** Unique identifier — for sessions this is the sessionId, for files the file path, etc. */
  id: string;
  /** Display label shown on the tab */
  title: string;
  /** What kind of tab this is — determines icon and routing */
  type: TabType;
  /** The route path this tab maps to (e.g. /sessions/abc, /files, /dashboard) */
  href: string;
  /** Whether the tab has been modified / needs attention (unsaved, pending permissions, etc.) */
  dirty?: boolean;
  /** Whether the tab is pinned (pinned tabs stay at the left, can't be closed) */
  pinned?: boolean;
  /** Timestamp when the tab was opened — used for ordering */
  openedAt: number;
  /** For sub-session tabs: the parent session ID (enables back-to-parent navigation) */
  parentSessionId?: string;
  /** The server instance this tab belongs to (session/file tabs are scoped per instance) */
  serverId?: string;
  /** Extra data for specialized tab types (e.g. preview URL, port number) */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Store
// ============================================================================

interface TabState {
  /** All open tabs keyed by tab.id for O(1) lookup */
  tabs: Record<string, Tab>;
  /** Ordered list of tab IDs (determines visual order) */
  tabOrder: string[];
  /** The currently active/focused tab ID */
  activeTabId: string | null;

  // --- Actions ---

  /** Open a new tab (or activate it if it already exists) */
  openTab: (tab: Omit<Tab, 'openedAt'>) => void;

  /** Close a tab by ID. Returns the next tab to activate (or null). */
  closeTab: (tabId: string) => string | null;

  /** Set the active tab */
  setActiveTab: (tabId: string) => void;

  /** Update a tab's title */
  updateTabTitle: (tabId: string, title: string) => void;

  /** Mark a tab dirty/clean */
  setTabDirty: (tabId: string, dirty: boolean) => void;

  /** Pin/unpin a tab */
  pinTab: (tabId: string, pinned: boolean) => void;

  /** Reorder tabs (move tabId to newIndex) */
  moveTab: (tabId: string, newIndex: number) => void;

  /** Close all tabs except the given one */
  closeOtherTabs: (tabId: string) => void;

  /** Close tabs to the right of the given tab */
  closeTabsToRight: (tabId: string) => void;

  /** Close all unpinned tabs */
  closeAllTabs: () => void;

  /** Get ordered tab objects */
  getOrderedTabs: () => Tab[];

  /** Save current server-scoped tabs and restore tabs for a different server */
  swapForServer: (newServerId: string, currentServerId?: string) => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: {},
      tabOrder: [],
      activeTabId: null,

      openTab: (tabInput) => {
        const { tabs, tabOrder } = get();

        // If tab already exists, just activate it
        if (tabs[tabInput.id]) {
          set({ activeTabId: tabInput.id });
          return;
        }

        const newTab: Tab = {
          ...tabInput,
          openedAt: Date.now(),
        };

        set({
          tabs: { ...tabs, [newTab.id]: newTab },
          tabOrder: [...tabOrder, newTab.id],
          activeTabId: newTab.id,
        });
      },

      closeTab: (tabId) => {
        const { tabs, tabOrder, activeTabId } = get();
        const tab = tabs[tabId];
        if (!tab || tab.pinned) return activeTabId;

        const { [tabId]: _, ...remainingTabs } = tabs;
        const newOrder = tabOrder.filter((id) => id !== tabId);

        // Determine next active tab
        let nextActiveId: string | null = null;
        if (activeTabId === tabId) {
          // For sub-session tabs: prefer activating the parent session tab
          if (tab.parentSessionId && remainingTabs[tab.parentSessionId]) {
            nextActiveId = tab.parentSessionId;
          } else {
            // Fallback: activate the nearest tab (prefer right neighbor, then left)
            const oldIndex = tabOrder.indexOf(tabId);
            if (newOrder.length > 0) {
              nextActiveId = newOrder[Math.min(oldIndex, newOrder.length - 1)];
            }
          }
        } else {
          nextActiveId = activeTabId;
        }

        set({
          tabs: remainingTabs,
          tabOrder: newOrder,
          activeTabId: nextActiveId,
        });

        return nextActiveId;
      },

      setActiveTab: (tabId) => {
        if (get().tabs[tabId]) {
          set({ activeTabId: tabId });
        }
      },

      updateTabTitle: (tabId, title) => {
        const { tabs } = get();
        if (!tabs[tabId]) return;
        set({
          tabs: { ...tabs, [tabId]: { ...tabs[tabId], title } },
        });
      },

      setTabDirty: (tabId, dirty) => {
        const { tabs } = get();
        if (!tabs[tabId]) return;
        set({
          tabs: { ...tabs, [tabId]: { ...tabs[tabId], dirty } },
        });
      },

      pinTab: (tabId, pinned) => {
        const { tabs, tabOrder } = get();
        if (!tabs[tabId]) return;
        const updatedTabs = { ...tabs, [tabId]: { ...tabs[tabId], pinned } };

        // Reorder: pinned tabs at the beginning
        const pinnedIds = tabOrder.filter((id) => updatedTabs[id]?.pinned);
        const unpinnedIds = tabOrder.filter((id) => !updatedTabs[id]?.pinned);

        set({
          tabs: updatedTabs,
          tabOrder: [...pinnedIds, ...unpinnedIds],
        });
      },

      moveTab: (tabId, newIndex) => {
        const { tabOrder } = get();
        const currentIndex = tabOrder.indexOf(tabId);
        if (currentIndex === -1) return;
        const newOrder = [...tabOrder];
        newOrder.splice(currentIndex, 1);
        newOrder.splice(newIndex, 0, tabId);
        set({ tabOrder: newOrder });
      },

      closeOtherTabs: (tabId) => {
        const { tabs } = get();
        const remainingTabs: Record<string, Tab> = {};
        const newOrder: string[] = [];

        // Keep the target tab and all pinned tabs
        for (const id of get().tabOrder) {
          if (id === tabId || tabs[id]?.pinned) {
            remainingTabs[id] = tabs[id];
            newOrder.push(id);
          }
        }

        set({
          tabs: remainingTabs,
          tabOrder: newOrder,
          activeTabId: tabId,
        });
      },

      closeTabsToRight: (tabId) => {
        const { tabs, tabOrder, activeTabId } = get();
        const index = tabOrder.indexOf(tabId);
        if (index === -1) return;

        const newOrder = tabOrder.filter(
          (id, i) => i <= index || tabs[id]?.pinned
        );
        const remainingTabs: Record<string, Tab> = {};
        for (const id of newOrder) {
          remainingTabs[id] = tabs[id];
        }

        set({
          tabs: remainingTabs,
          tabOrder: newOrder,
          activeTabId: remainingTabs[activeTabId!] ? activeTabId : tabId,
        });
      },

      closeAllTabs: () => {
        const { tabs, tabOrder } = get();
        const remainingTabs: Record<string, Tab> = {};
        const newOrder: string[] = [];

        for (const id of tabOrder) {
          if (tabs[id]?.pinned) {
            remainingTabs[id] = tabs[id];
            newOrder.push(id);
          }
        }

        set({
          tabs: remainingTabs,
          tabOrder: newOrder,
          activeTabId: newOrder[0] || null,
        });
      },

      getOrderedTabs: () => {
        const { tabs, tabOrder } = get();
        return tabOrder.map((id) => tabs[id]).filter(Boolean);
      },

      swapForServer: (newServerId: string, currentServerId?: string) => {
        const { tabs, tabOrder, activeTabId } = get();

        // Save the entire current tab state for the old server
        if (currentServerId) {
          try {
            const cache = JSON.parse(localStorage.getItem('kortix-tabs-per-server') || '{}');
            cache[currentServerId] = { tabs, tabOrder, activeTabId };
            localStorage.setItem('kortix-tabs-per-server', JSON.stringify(cache));
          } catch {}
        }

        // Restore the full tab state for the new server
        try {
          const cache = JSON.parse(localStorage.getItem('kortix-tabs-per-server') || '{}');
          const saved = cache[newServerId];
          if (saved?.tabs && saved?.tabOrder) {
            set({
              tabs: saved.tabs,
              tabOrder: saved.tabOrder,
              activeTabId: saved.activeTabId || null,
            });
            return;
          }
        } catch {}

        // No saved state for new server — clear tabs, route-sync will add Dashboard
        set({ tabs: {}, tabOrder: [], activeTabId: null });
      },
    }),
    {
      name: 'kortix-tabs',
      partialize: (state) => ({
        tabs: state.tabs,
        tabOrder: state.tabOrder,
        activeTabId: state.activeTabId,
      }),
    }
  )
);
