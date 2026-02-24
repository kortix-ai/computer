'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

/** Which modifier key is used for tab switching (Cmd+1..9 or Ctrl+1..9) */
export type TabSwitchModifier = 'meta' | 'ctrl';

/** UI zoom / interface scale preset */
export type UIZoom = 'compact' | 'default' | 'comfortable' | 'large';

export const ZOOM_LEVELS: { id: UIZoom; label: string; value: number }[] = [
  { id: 'compact', label: 'Compact', value: 90 },
  { id: 'default', label: 'Regular', value: 100 },
  { id: 'comfortable', label: 'Large', value: 110 },
  { id: 'large', label: 'Extra Large', value: 120 },
];

/** Get the CSS zoom percentage for a given zoom preset */
export function getZoomValue(zoom: UIZoom): number {
  return ZOOM_LEVELS.find((z) => z.id === zoom)?.value ?? 100;
}

export interface KeyboardShortcutPreferences {
  /** Modifier used for tab switching shortcuts (1-9) — default: 'meta' on macOS, 'ctrl' elsewhere */
  tabSwitchModifier: TabSwitchModifier;
  /** Modifier for close-tab shortcut (W) — follows tabSwitchModifier */
  closeTabModifier: TabSwitchModifier;
}

export interface UserPreferences {
  keyboard: KeyboardShortcutPreferences;
  /** Selected Kortix theme ID (e.g. 'default', 'ember', 'aurora') */
  themeId: string;
  /** Selected desktop wallpaper ID */
  wallpaperId: string;
  /** UI zoom / interface scale preset */
  uiZoom: UIZoom;
}

// ============================================================================
// Helpers
// ============================================================================

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function getDefaultKeyboardPreferences(): KeyboardShortcutPreferences {
  return {
    tabSwitchModifier: isMac ? 'meta' : 'ctrl',
    closeTabModifier: isMac ? 'meta' : 'ctrl',
  };
}

// ============================================================================
// Store
// ============================================================================

interface UserPreferencesState {
  preferences: UserPreferences;

  /** Update keyboard shortcut preferences (partial merge) */
  setKeyboardPreferences: (prefs: Partial<KeyboardShortcutPreferences>) => void;

  /** Set the active Kortix theme by ID */
  setThemeId: (themeId: string) => void;

  /** Set the active desktop wallpaper by ID */
  setWallpaperId: (wallpaperId: string) => void;

  /** Set the UI zoom / interface scale */
  setUIZoom: (zoom: UIZoom) => void;

  /** Reset all preferences to defaults */
  resetPreferences: () => void;

  /** Get the label for the current tab switch modifier (e.g. "Cmd" or "Ctrl") */
  getModifierLabel: () => string;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      preferences: {
        keyboard: getDefaultKeyboardPreferences(),
        themeId: 'graphite',
        wallpaperId: 'brandmark',
        uiZoom: 'default',
      },

      setKeyboardPreferences: (prefs) => {
        const current = get().preferences;
        set({
          preferences: {
            ...current,
            keyboard: { ...current.keyboard, ...prefs },
          },
        });
      },

      setThemeId: (themeId) => {
        const current = get().preferences;
        set({
          preferences: {
            ...current,
            themeId,
          },
        });
      },

      setWallpaperId: (wallpaperId) => {
        const current = get().preferences;
        set({
          preferences: {
            ...current,
            wallpaperId,
          },
        });
      },

      setUIZoom: (uiZoom) => {
        const current = get().preferences;
        set({
          preferences: {
            ...current,
            uiZoom,
          },
        });
      },

      resetPreferences: () => {
        set({
          preferences: {
            keyboard: getDefaultKeyboardPreferences(),
            themeId: 'graphite',
            wallpaperId: 'brandmark',
            uiZoom: 'default',
          },
        });
      },

      getModifierLabel: () => {
        const mod = get().preferences.keyboard.tabSwitchModifier;
        return mod === 'meta' ? (isMac ? 'Cmd' : 'Win') : 'Ctrl';
      },
    }),
    {
      name: 'kortix-user-preferences',
      partialize: (state) => ({
        preferences: state.preferences,
      }),
    }
  )
);
