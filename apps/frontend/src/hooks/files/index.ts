/**
 * File hooks barrel — re-exports from @/features/files
 *
 * Plus standalone hooks that are not file-operation-specific:
 * - useExternalImage (fetches arbitrary URLs)
 * - useVncPreloader (VNC iframe preloading)
 */

// Core file operations
export {
  // Types
  type FileNode,
  type FileContent,
  type FindMatch,
  type OpenCodeProjectInfo,
  type ServerHealth,
  // API
  listFiles,
  readFile,
  findFiles,
  findText,
  getCurrentProject,
  getServerHealth,
  isServerReachable,
  // Hooks — read
  useFileList,
  useInvalidateFileList,
  fileListKeys,
  useFileContent,
  useInvalidateFileContent,
  fileContentKeys,
  useFileSearch,
  useTextSearch,
  fileSearchKeys,
  useServerHealth,
  useCurrentProject,
  useFileEventInvalidation,
  // Hooks — write
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
  // API — binary helpers
  readFileAsBlob,
  downloadFile,
  // API — write
  uploadFile,
  deleteFile,
  mkdirFile,
  renameFile,
  type UploadResult,
  // Store
  useFilesStore,
} from '@/features/files';

// Standalone hooks (not sandbox/file-operation-specific)
export { useExternalImage } from './use-external-image';
export { useVncPreloader, type VncStatus } from './useVncPreloader';
