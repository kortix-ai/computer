'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/lib/opencode-sdk';
import { opencodeKeys, useOpenCodeCurrentProject } from './use-opencode-sessions';
import type { Worktree } from './use-opencode-sessions';

// ============================================================================
// Helper: unwrap SDK response (data / error)
// ============================================================================

function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error) {
    const err = result.error as any;
    const status = (result.response as Response | undefined)?.status;
    const msg =
      err?.data?.message ||
      err?.message ||
      err?.error ||
      (typeof err === 'string' ? err : null) ||
      (typeof err === 'object' ? JSON.stringify(err) : null) ||
      (status ? `Server returned ${status}` : 'SDK request failed');
    throw new Error(msg);
  }
  return result.data as T;
}

// ============================================================================
// Query: List worktrees
// ============================================================================

/**
 * Fetch all sandbox worktrees for the current project.
 * Returns an array of worktree directory paths (strings).
 * Only enabled once the current project has loaded.
 * For non-git projects the server returns an empty list or an error
 * which we silently swallow (retry: false).
 */
export function useWorktreeList() {
  const { data: project } = useOpenCodeCurrentProject();
  const isGitProject = project?.vcs === 'git';

  return useQuery<string[]>({
    queryKey: opencodeKeys.worktrees(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.worktree.list();
      // Silently return empty array on error (non-git projects)
      if (result.error) return [];
      return (result.data ?? []) as string[];
    },
    enabled: isGitProject,
    staleTime: Infinity, // SSE worktree.ready/failed events trigger refetch
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

// ============================================================================
// Mutation: Create worktree
// ============================================================================

/**
 * Create a new git worktree.
 * Accepts an optional `directory` to target a specific project root,
 * plus optional `name` and `startCommand`.
 * Returns the newly created Worktree (name, branch, directory).
 */
export function useCreateWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input?: { directory?: string; name?: string; startCommand?: string }) => {
      const client = getClient();
      const { directory, ...rest } = input || {};
      const result = await client.worktree.create({
        ...(directory && { directory }),
        ...(Object.keys(rest).length > 0 && { worktreeCreateInput: rest }),
      });
      return unwrap(result) as Worktree;
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: opencodeKeys.worktrees(), type: 'active' });
      queryClient.refetchQueries({ queryKey: opencodeKeys.projects(), type: 'active' });
    },
    // Suppress global error handler — callers handle errors via mutateAsync catch
    onError: () => {},
  });
}

// ============================================================================
// Mutation: Remove worktree
// ============================================================================

/**
 * Remove a git worktree and delete its branch.
 * Requires the worktree directory path.
 */
export function useRemoveWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ directory }: { directory: string }) => {
      const client = getClient();
      const result = await client.worktree.remove({
        worktreeRemoveInput: { directory },
      });
      return unwrap(result);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: opencodeKeys.worktrees(), type: 'active' });
      queryClient.refetchQueries({ queryKey: opencodeKeys.projects(), type: 'active' });
    },
    onError: () => {},
  });
}

// ============================================================================
// Mutation: Reset worktree
// ============================================================================

/**
 * Reset a worktree branch to the primary default branch.
 * Requires the worktree directory path.
 */
export function useResetWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ directory }: { directory: string }) => {
      const client = getClient();
      const result = await client.worktree.reset({
        worktreeResetInput: { directory },
      });
      return unwrap(result);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: opencodeKeys.worktrees(), type: 'active' });
      queryClient.refetchQueries({ queryKey: opencodeKeys.projects(), type: 'active' });
    },
    onError: () => {},
  });
}
