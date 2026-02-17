/**
 * Files feature — OpenCode server filesystem browsing.
 *
 * This module replaces the entire legacy sandbox-based file system.
 * All file operations go directly to the active OpenCode server.
 */

// Types
export type { FindMatch } from './types';

// API — read
export {
  readFile,
  // binary helpers
  
  // write
  uploadFile,
  mkdirFile
} from './api/opencode-files';

// API — semantic search (LSS)

// API — git history

// Hooks
export {
  useFileList,
  useFileSearch,
  useTextSearch,
  useLssSearch,
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
  fileListKeys
} from './hooks';

// Store
export { useFilesStore } from './store/files-store';

// Components
export { FileBrowser, FileViewer, FileHistoryPanel } from './components';
