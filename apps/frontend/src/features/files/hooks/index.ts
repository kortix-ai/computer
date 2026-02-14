/**
 * Files feature hooks — all backed by the OpenCode server API.
 */

// Directory listing
export {
  useFileList,
  useInvalidateFileList,
  fileListKeys,
} from './use-file-list';

// File content reading
export {
  useFileContent,
  useInvalidateFileContent,
  fileContentKeys,
} from './use-file-content';

// File/text search
export {
  useFileSearch,
  useTextSearch,
  fileSearchKeys,
} from './use-file-search';

// Semantic search (LSS)
export { useLssSearch, lssSearchKeys } from './use-lss-search';

// Server health & project info
export { useServerHealth, useCurrentProject } from './use-server-health';

// File mutations (write operations)
export {
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
} from './use-file-mutations';

// Git status
export {
  useGitStatus,
  buildGitStatusMap,
  gitStatusKeys,
} from './use-git-status';

// SSE-based real-time invalidation
export { useFileEventInvalidation } from './use-file-events';

// Git history
export {
  useFileHistory,
  useFileCommitDiff,
  useFileAtCommit,
  fileHistoryKeys,
} from './use-file-history';
