/**
 * Marketplace Store — transient UI state only.
 *
 * Tracks which components are currently being installed (optimistic UI).
 * Actual "installed" state comes from the OpenCode SDK skill list
 * (see useInstalledSkillNames in use-marketplace.ts).
 *
 * NO localStorage persistence — the server is the source of truth.
 */

import { create } from 'zustand';

interface MarketplaceState {
  /** Component names currently in the process of being installed */
  installing: string[];

  /** Mark a component as currently installing (optimistic) */
  markInstalling: (name: string) => void;
  /** Clear the installing flag for a component */
  clearInstalling: (name: string) => void;
}

export const useMarketplaceStore = create<MarketplaceState>()((set) => ({
  installing: [],

  markInstalling: (name: string) =>
    set((state) => ({
      installing: state.installing.includes(name)
        ? state.installing
        : [...state.installing, name],
    })),

  clearInstalling: (name: string) =>
    set((state) => ({
      installing: state.installing.filter((n) => n !== name),
    })),
}));
