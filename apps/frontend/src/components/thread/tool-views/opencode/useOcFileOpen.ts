'use client';

import { useCallback, useEffect, useState } from 'react';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { getClient } from '@/lib/opencode-sdk';

/** Module-level cache so we only fetch once across all instances */
let cachedWorktree: string | null = null;

/** Strip a worktree prefix from an absolute path → project-relative path */
function toRelative(absPath: string, worktree: string): string {
  if (!worktree || worktree === '/') return absPath;
  const prefix = worktree.endsWith('/') ? worktree : worktree + '/';
  if (absPath.startsWith(prefix)) return absPath.slice(prefix.length);
  if (absPath === worktree) return '.';
  return absPath;
}

/** Fetch worktree from SDK — tries worktree then directory field */
async function fetchWorktreeFromSdk(): Promise<string | null> {
  try {
    const client = getClient();
    const res = await client.path.get();
    const pathData = res.data;
    console.log('[useOcFileOpen] path.get() response:', JSON.stringify(pathData));
    const wt = pathData?.worktree || pathData?.directory || '';
    if (wt) {
      cachedWorktree = wt;
      return wt;
    }
  } catch (err) {
    console.error('[useOcFileOpen] path.get() failed:', err);
  }
  return null;
}

/**
 * Hook: file-open handlers & path display for OC tool views.
 *
 * Directly calls `client.path.get()` from @kortix/opencode-sdk to resolve worktree.
 * Converts absolute paths → project-relative paths (same as Files tab).
 */
export function useOcFileOpen() {
  const openFileInComputer = useKortixComputerStore((s) => s.openFileInComputer);
  const [worktree, setWorktree] = useState<string | null>(cachedWorktree);

  // Fetch worktree directly from SDK on mount
  useEffect(() => {
    if (cachedWorktree) {
      setWorktree(cachedWorktree);
      return;
    }
    let cancelled = false;
    fetchWorktreeFromSdk().then((wt) => {
      if (!cancelled && wt) {
        setWorktree(wt);
      }
    });
    return () => { cancelled = true; };
  }, []);

  /** Sync: convert absolute → relative for display */
  const toDisplayPath = useCallback(
    (absPath: string): string => {
      if (!absPath || !absPath.startsWith('/')) return absPath;
      if (worktree) return toRelative(absPath, worktree);
      return absPath;
    },
    [worktree],
  );

  /** Get worktree, fetching on-demand if needed */
  const getWorktree = useCallback(async (): Promise<string | null> => {
    const wt = worktree || cachedWorktree;
    if (wt) return wt;
    const fetched = await fetchWorktreeFromSdk();
    if (fetched) setWorktree(fetched);
    return fetched;
  }, [worktree]);

  /** Open a single file — resolves worktree before opening */
  const openFile = useCallback(
    async (filePath: string) => {
      if (!filePath.startsWith('/')) {
        openFileInComputer(filePath);
        return;
      }
      const wt = await getWorktree();
      const resolved = wt ? toRelative(filePath, wt) : filePath;
      console.log('[useOcFileOpen] openFile wt=' + wt, filePath, '→', resolved);
      openFileInComputer(resolved);
    },
    [openFileInComputer, getWorktree],
  );

  /** Open a file with a navigation list */
  const openFileWithList = useCallback(
    async (filePath: string, allPaths: string[]) => {
      if (!filePath.startsWith('/')) {
        openFileInComputer(filePath, allPaths);
        return;
      }
      const wt = await getWorktree();
      if (wt) {
        const resolved = toRelative(filePath, wt);
        const resolvedList = allPaths.map((p) => toRelative(p, wt));
        console.log('[useOcFileOpen] openFileWithList wt=' + wt, filePath, '→', resolved);
        openFileInComputer(resolved, resolvedList);
      } else {
        openFileInComputer(filePath, allPaths);
      }
    },
    [openFileInComputer, getWorktree],
  );

  return { openFile, openFileWithList, toDisplayPath };
}
