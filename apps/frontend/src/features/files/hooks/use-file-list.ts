'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { listFiles } from '../api/opencode-files';
import type { FileNode } from '../types';

export const fileListKeys = {
  all: ['opencode-files', 'list'] as const,
  dir: (serverUrl: string, dirPath: string) =>
    ['opencode-files', 'list', serverUrl, dirPath] as const,
};

/**
 * Fetch the directory listing for a path on the active OpenCode server.
 *
 * Uses GET /file?path=<path> which returns FileNode[].
 */
export function useFileList(
  dirPath: string,
  options?: { enabled?: boolean },
) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const urlVersion = useServerStore((s) => s.urlVersion);

  return useQuery<FileNode[]>({
    queryKey: fileListKeys.dir(serverUrl, dirPath),
    queryFn: () => listFiles(dirPath),
    enabled: !!dirPath && options?.enabled !== false,
    staleTime: 5_000,
    gcTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: Error) => {
      // Don't retry on 404 (dir doesn't exist) or access denied
      if (error.message.includes('404') || error.message.includes('403')) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 5000),
  });
}

/**
 * Utility to imperatively invalidate all file list queries for the active server.
 */
function useInvalidateFileList() {
  const queryClient = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());

  return (dirPath?: string) => {
    if (dirPath) {
      queryClient.invalidateQueries({
        queryKey: fileListKeys.dir(serverUrl, dirPath),
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: fileListKeys.all,
      });
    }
  };
}
