'use client';

import { useQuery } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { getServerHealth, getCurrentProject } from '../api/opencode-files';
import type { ServerHealth, OpenCodeProjectInfo } from '../types';

/**
 * Check if the active OpenCode server is reachable and healthy.
 */
export function useServerHealth(options?: { enabled?: boolean }) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());

  return useQuery<ServerHealth>({
    queryKey: ['opencode-server', 'health', serverUrl],
    queryFn: getServerHealth,
    enabled: options?.enabled !== false,
    staleTime: 10_000,
    gcTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    retryDelay: 2000,
  });
}

/**
 * Get current project info from the active OpenCode server.
 * Returns worktree path, project name, VCS info, etc.
 */
export function useCurrentProject(options?: { enabled?: boolean }) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());

  return useQuery<OpenCodeProjectInfo>({
    queryKey: ['opencode-server', 'project', serverUrl],
    queryFn: getCurrentProject,
    enabled: options?.enabled !== false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
