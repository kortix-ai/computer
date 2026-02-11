'use client';

// Re-export hooks from their proper locations for backward compatibility
export { useProjects, usePublicProjectsQuery, useUpdateProject, useDeleteProject } from '../threads/use-project';
export { useThreads } from '../threads/use-threads';
export { useDeleteThread, useDeleteMultipleThreads } from '../threads/use-thread-mutations';
