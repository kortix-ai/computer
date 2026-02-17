/**
 * Files feature hooks — all backed by the OpenCode server API.
 */

// Directory listing
export { useFileList, fileListKeys } from './use-file-list';

// File content reading
export { useFileContent } from './use-file-content';

// File/text search
export { useFileSearch, useTextSearch } from './use-file-search';

// Semantic search (LSS)
export { useLssSearch } from './use-lss-search';

// Server health & project info
export { useServerHealth, useCurrentProject } from './use-server-health';

// File mutations (write operations)
export {
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename
} from './use-file-mutations';

// Git status
export { useGitStatus, buildGitStatusMap } from './use-git-status';

// SSE-based real-time invalidation

// Git history
