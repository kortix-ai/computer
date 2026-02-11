'use client';

/**
 * React port of the SolidJS `context/models.tsx` from the OpenCode reference app.
 *
 * Provides:
 * - Model visibility (show/hide per model, persisted in localStorage)
 * - Recent models (up to 5, persisted)
 * - "Latest" logic (models released within 6 months, newest per family shown by default)
 * - Variant persistence per model
 *
 * Uses localStorage instead of Solid's persisted store, with a React-compatible
 * zustand-like pattern via useState + useCallback.
 */

import { useMemo, useCallback, useSyncExternalStore } from 'react';
import type { FlatModel } from '@/components/session/session-chat-input';

// ============================================================================
// Types
// ============================================================================

export type ModelKey = { providerID: string; modelID: string };

type Visibility = 'show' | 'hide';

interface UserEntry extends ModelKey {
  visibility: Visibility;
  favorite?: boolean;
}

interface ModelStore {
  user: UserEntry[];
  recent: ModelKey[];
  variant: Record<string, string | undefined>;
}

// ============================================================================
// LocalStorage persistence
// ============================================================================

const STORE_KEY = 'opencode-model-store-v1';

function loadStore(): ModelStore {
  if (typeof window === 'undefined') {
    return { user: [], recent: [], variant: {} };
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { user: [], recent: [], variant: {} };
}

let _store: ModelStore = loadStore();
const _listeners = new Set<() => void>();

function getStore(): ModelStore {
  return _store;
}

function setStore(next: ModelStore) {
  _store = next;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  for (const fn of _listeners) fn();
}

function subscribe(fn: () => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ============================================================================
// Latest logic — direct port from SolidJS reference
// ============================================================================

function isWithinMonths(dateStr: string | undefined, months: number): boolean {
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
    return diffMonths < months;
  } catch {
    return false;
  }
}

/**
 * Compute "latest" models: models released within 6 months,
 * grouped by provider then family, newest per family wins.
 */
function computeLatestSet(models: FlatModel[]): Set<string> {
  // Filter to recent models (within 6 months)
  const recent = models.filter((m) => isWithinMonths(m.releaseDate, 6));

  // Group by provider
  const byProvider = new Map<string, FlatModel[]>();
  for (const m of recent) {
    const list = byProvider.get(m.providerID) || [];
    list.push(m);
    byProvider.set(m.providerID, list);
  }

  const latestKeys = new Set<string>();

  for (const [, providerModels] of byProvider) {
    // Group by family
    const byFamily = new Map<string, FlatModel[]>();
    for (const m of providerModels) {
      const family = m.family || m.modelID;
      const list = byFamily.get(family) || [];
      list.push(m);
      byFamily.set(family, list);
    }

    // Pick newest per family
    for (const [, familyModels] of byFamily) {
      familyModels.sort((a, b) => {
        const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return db - da; // newest first
      });
      if (familyModels[0]) {
        latestKeys.add(`${familyModels[0].providerID}:${familyModels[0].modelID}`);
      }
    }
  }

  return latestKeys;
}

// ============================================================================
// Hook
// ============================================================================

export function useModelStore(allModels: FlatModel[]) {
  const store = useSyncExternalStore(subscribe, getStore, getStore);

  // Compute latest set
  const latestSet = useMemo(() => computeLatestSet(allModels), [allModels]);

  // Visibility map from user preferences
  const visibilityMap = useMemo(() => {
    const map = new Map<string, Visibility>();
    for (const item of store.user) {
      map.set(`${item.providerID}:${item.modelID}`, item.visibility);
    }
    return map;
  }, [store.user]);

  // Check if a model is visible (port of SolidJS visible() function)
  const isVisible = useCallback(
    (model: ModelKey): boolean => {
      const key = `${model.providerID}:${model.modelID}`;
      const state = visibilityMap.get(key);
      if (state === 'hide') return false;
      if (state === 'show') return true;
      if (latestSet.has(key)) return true;
      // If no release_date or invalid, show by default
      const m = allModels.find(
        (x) => x.providerID === model.providerID && x.modelID === model.modelID,
      );
      if (!m?.releaseDate) return true;
      try {
        const d = new Date(m.releaseDate);
        if (isNaN(d.getTime())) return true;
      } catch {
        return true;
      }
      return false;
    },
    [visibilityMap, latestSet, allModels],
  );

  // Check if a model is in the latest set
  const isLatest = useCallback(
    (model: ModelKey): boolean => {
      return latestSet.has(`${model.providerID}:${model.modelID}`);
    },
    [latestSet],
  );

  // Set visibility for a model
  const setVisibility = useCallback(
    (model: ModelKey, show: boolean) => {
      const s = getStore();
      const index = s.user.findIndex(
        (x) => x.modelID === model.modelID && x.providerID === model.providerID,
      );
      const next = [...s.user];
      if (index >= 0) {
        next[index] = { ...next[index], visibility: show ? 'show' : 'hide' };
      } else {
        next.push({ ...model, visibility: show ? 'show' : 'hide' });
      }
      setStore({ ...s, user: next });
    },
    [],
  );

  // Recent models
  const recentModels = useMemo(() => store.recent, [store.recent]);

  const pushRecent = useCallback((model: ModelKey) => {
    const s = getStore();
    const key = (m: ModelKey) => m.providerID + m.modelID;
    const existing = s.recent.filter((r) => key(r) !== key(model));
    const next = [model, ...existing].slice(0, 5);
    setStore({ ...s, recent: next });
  }, []);

  // Variant persistence
  const getVariant = useCallback(
    (model: ModelKey): string | undefined => {
      return store.variant[`${model.providerID}/${model.modelID}`];
    },
    [store.variant],
  );

  const setVariant = useCallback((model: ModelKey, value: string | undefined) => {
    const s = getStore();
    const k = `${model.providerID}/${model.modelID}`;
    setStore({ ...s, variant: { ...s.variant, [k]: value } });
  }, []);

  return {
    isVisible,
    isLatest,
    setVisibility,
    recent: recentModels,
    pushRecent,
    getVariant,
    setVariant,
    /** All user visibility preferences (for manage models dialog) */
    userPrefs: store.user,
  };
}
