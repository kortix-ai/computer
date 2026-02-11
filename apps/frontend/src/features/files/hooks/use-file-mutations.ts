'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  uploadFile,
  deleteFile,
  mkdirFile,
  renameFile,
  type UploadResult,
} from '../api/opencode-files';
import { fileListKeys } from './use-file-list';
import { fileContentKeys } from './use-file-content';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import type { FileNode } from '../types';

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export function useFileUpload() {
  const queryClient = useQueryClient();

  return useMutation<
    UploadResult[],
    Error,
    { file: File | Blob; targetPath?: string }
  >({
    mutationFn: ({ file, targetPath }) => uploadFile(file, targetPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fileListKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function useFileDelete() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { filePath: string }>({
    mutationFn: ({ filePath }) => deleteFile(filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fileListKeys.all });
      queryClient.invalidateQueries({ queryKey: fileContentKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Mkdir
// ---------------------------------------------------------------------------

export function useFileMkdir() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { dirPath: string }, { previousData?: FileNode[]; cacheKey?: readonly string[] }>({
    mutationFn: ({ dirPath }) => mkdirFile(dirPath),
    onMutate: async ({ dirPath }) => {
      // Determine the parent directory for this new folder
      const parts = dirPath.split('/').filter(Boolean);
      const folderName = parts.pop() || dirPath;
      const parentPath = parts.length > 0 ? parts.join('/') : '.';

      const serverUrl = getActiveOpenCodeUrl();
      const cacheKey = fileListKeys.dir(serverUrl, parentPath) as unknown as readonly string[];

      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: cacheKey });

      // Snapshot the current data
      const previousData = queryClient.getQueryData<FileNode[]>(cacheKey);

      // Optimistically insert the new directory
      if (previousData) {
        const optimisticNode: FileNode = {
          name: folderName,
          path: dirPath,
          absolute: '', // Will be filled on refetch
          type: 'directory',
          ignored: false,
        };
        queryClient.setQueryData<FileNode[]>(cacheKey, [...previousData, optimisticNode]);
      }

      return { previousData, cacheKey };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.cacheKey && context.previousData) {
        queryClient.setQueryData(context.cacheKey, context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch to get the real server state
      queryClient.invalidateQueries({ queryKey: fileListKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export function useFileRename() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { from: string; to: string }>({
    mutationFn: ({ from, to }) => renameFile(from, to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fileListKeys.all });
      queryClient.invalidateQueries({ queryKey: fileContentKeys.all });
    },
  });
}
