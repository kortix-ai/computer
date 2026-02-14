/**
 * Files feature — OpenCode server filesystem browsing.
 *
 * This module replaces the entire legacy sandbox-based file system.
 * All file operations go directly to the active OpenCode server.
 */

// Types
export type {
  FileNode,
  FileContent,
  FilePatch,
  FilePatchHunk,
  FindMatch,
  LssHit,
  LssSearchResult,
  OpenCodeProjectInfo,
  ServerHealth,
  GitCommit,
  FileHistoryResult,
  FileCommitDiff,
} from './types';

// API — read
export {
  listFiles,
  readFile,
  findFiles,
  findText,
  getCurrentProject,
  getServerHealth,
  isServerReachable,
  // binary helpers
  readFileAsBlob,
  downloadFile,
  // write
  uploadFile,
  deleteFile,
  mkdirFile,
  renameFile,
  type UploadResult,
} from './api/opencode-files';

// API — semantic search (LSS)
export { searchLss } from './api/lss-search';

// API — git history
export { getFileHistory, getFileCommitDiff, getFileAtCommit } from './api/git-history';

// Hooks
export {
  useFileList,
  useInvalidateFileList,
  useFileContent,
  useInvalidateFileContent,
  useFileSearch,
  useTextSearch,
  useLssSearch,
  useServerHealth,
  useCurrentProject,
  useFileEventInvalidation,
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
  useFileHistory,
  useFileCommitDiff,
  useFileAtCommit,
  fileListKeys,
  fileContentKeys,
  fileSearchKeys,
  fileHistoryKeys,
  lssSearchKeys,
} from './hooks';

// Store
export { useFilesStore, type FilesView } from './store/files-store';

// Components
export {
  FileBrowser,
  FileViewer,
  FileSearch,
  FileBreadcrumbs,
  FileTreeItem,
  FileHistoryPanel,
} from './components';
