'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  uploadFile,
  deleteFile,
  mkdirFile,
  renameFile,
  createFile,
  copyFile,
  type UploadResult,
} from '../api/opencode-files';
import { fileListKeys } from './use-file-list';
import { fileContentKeys } from './use-file-content';

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

  return useMutation<boolean, Error, { dirPath: string }>({
    mutationFn: ({ dirPath }) => mkdirFile(dirPath),
    onSuccess: () => {
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

// ---------------------------------------------------------------------------
// Create empty file
// ---------------------------------------------------------------------------

export function useFileCreate() {
  const queryClient = useQueryClient();

  return useMutation<UploadResult[], Error, { filePath: string }>({
    mutationFn: ({ filePath }) => createFile(filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fileListKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Copy file
// ---------------------------------------------------------------------------

export function useFileCopy() {
  const queryClient = useQueryClient();

  return useMutation<UploadResult[], Error, { sourcePath: string; destPath: string }>({
    mutationFn: ({ sourcePath, destPath }) => copyFile(sourcePath, destPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fileListKeys.all });
    },
  });
}
