'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type WebNotificationPermission = 'default' | 'granted' | 'denied';

export interface WebNotificationPreferences {
  /** Master toggle for browser notifications */
  enabled: boolean;
  /** Notify when a session task completes (becomes idle after being busy) */
  onCompletion: boolean;
  /** Notify when a session error occurs */
  onError: boolean;
  /** Notify when Kortix asks a question that needs user input */
  onQuestion: boolean;
  /** Notify when Kortix requests a permission */
  onPermission: boolean;
  /** Only send browser notifications when the tab is not visible */
  onlyWhenHidden: boolean;
  /** Play a sound with notifications */
  playSound: boolean;
}

// ============================================================================
// Store
// ============================================================================

interface WebNotificationState {
  /** Current browser permission state */
  permission: WebNotificationPermission;
  /** User preferences for web notifications */
  preferences: WebNotificationPreferences;

  /** Sync the permission state from the browser Notification API */
  syncPermission: () => void;
  /** Request browser notification permission */
  requestPermission: () => Promise<WebNotificationPermission>;
  /** Update a single preference */
  setPreference: <K extends keyof WebNotificationPreferences>(
    key: K,
    value: WebNotificationPreferences[K],
  ) => void;
  /** Toggle the master enabled switch (also requests permission if needed) */
  toggleEnabled: () => Promise<void>;
}

const DEFAULT_PREFERENCES: WebNotificationPreferences = {
  enabled: false,
  onCompletion: true,
  onError: true,
  onQuestion: true,
  onPermission: true,
  onlyWhenHidden: true,
  playSound: true,
};

export const useWebNotificationStore = create<WebNotificationState>()(
  persist(
    (set, get) => ({
      permission: (typeof Notification !== 'undefined'
        ? (Notification.permission as WebNotificationPermission)
        : 'default'),
      preferences: DEFAULT_PREFERENCES,

      syncPermission: () => {
        if (typeof Notification === 'undefined') return;
        set({ permission: Notification.permission as WebNotificationPermission });
      },

      requestPermission: async () => {
        if (typeof Notification === 'undefined') return 'denied';
        const result = await Notification.requestPermission();
        const perm = result as WebNotificationPermission;
        set({ permission: perm });
        return perm;
      },

      setPreference: (key, value) => {
        set((state) => ({
          preferences: { ...state.preferences, [key]: value },
        }));
      },

      toggleEnabled: async () => {
        const state = get();
        const wasEnabled = state.preferences.enabled;

        if (!wasEnabled) {
          // Turning on — request permission if not yet granted
          if (state.permission !== 'granted') {
            const perm = await state.requestPermission();
            if (perm !== 'granted') {
              // User denied — keep disabled
              return;
            }
          }
          set((s) => ({
            preferences: { ...s.preferences, enabled: true },
          }));
        } else {
          // Turning off
          set((s) => ({
            preferences: { ...s.preferences, enabled: false },
          }));
        }
      },
    }),
    {
      name: 'kortix-web-notifications',
      partialize: (state) => ({
        preferences: state.preferences,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration, sync the actual browser permission
        state?.syncPermission();
      },
    },
  ),
);
