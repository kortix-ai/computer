/**
 * Thread Hooks - Retained exports only
 * Legacy thread-specific hooks removed; project/sidebar hooks kept.
 */
export { useThreadAgentStatuses } from './use-thread-agent-status';
export { useProjectRealtime } from './useProjectRealtime';

// Thread queries
export { useThreadQuery, useThreads, useThreadsForProject } from './use-threads';
export { useThreadSearch } from './use-thread-search';

// Thread mutations
export { useToggleThreadPublicStatus, useUpdateThreadMutation, useDeleteThreadMutation } from './use-threads';
export { useCreateThread, useAddUserMessage, useDeleteThread, useDeleteMultipleThreads } from './use-thread-mutations';

// Project queries
export { useProjectQuery, useProjects, usePublicProjectsQuery } from './use-project';
// Project mutations
export { useUpdateProjectMutation, useUpdateProject, useDeleteProject } from './use-project';

// Agent runs
export { useAgentRunsQuery, useStartAgentMutation, useStopAgentMutation } from './use-agent-run';

// Optimistic agent start
export { useOptimisticAgentStart } from './use-optimistic-agent-start';
export type { 
  OptimisticAgentStartOptions, 
  OptimisticAgentStartResult, 
  AgentLimitInfo,
  UseOptimisticAgentStartReturn 
} from './use-optimistic-agent-start';
