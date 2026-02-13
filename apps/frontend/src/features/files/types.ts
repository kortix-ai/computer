/**
 * Types matching the OpenCode server REST API responses.
 * See: https://opencode.ai/docs/server/#files
 */

/** GET /file?path=<path> response item */
export interface FileNode {
  name: string;
  path: string; // relative to project root
  absolute: string; // absolute filesystem path
  type: 'file' | 'directory';
  ignored: boolean;
}

/** GET /file/content?path=<path> response */
export interface FileContent {
  type: 'text' | 'binary';
  content: string;
  patch?: FilePatch;
  encoding?: 'base64'; // present when content is base64-encoded (images, binaries)
  mimeType?: string;
}

export interface FilePatch {
  oldFileName: string;
  newFileName: string;
  oldHeader?: string;
  newHeader?: string;
  hunks: FilePatchHunk[];
  index?: string;
}

export interface FilePatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/** GET /find?pattern=<pat> response item */
export interface FindMatch {
  path: string;
  lines: string;
  line_number: number;
  absolute_offset: number;
  submatches: Array<{ start: number; end: number }>;
}

/** LSS semantic search hit (from /lss/search endpoint) */
export interface LssHit {
  file_path: string;
  score: number;
  snippet: string;
  rank_stage?: string;
  indexed_at?: number;
}

/** LSS search response item (one per query) */
export interface LssSearchResult {
  query: string;
  hits: LssHit[];
}

/** GET /project/current response */
export interface OpenCodeProjectInfo {
  id: string;
  worktree: string;
  vcs?: 'git';
  name?: string;
  icon?: {
    url?: string;
    override?: string;
    color?: string;
  };
  time: {
    created: number;
    updated: number;
    initialized?: number;
  };
  sandboxes: string[];
}

/** GET /global/health response */
export interface ServerHealth {
  healthy: boolean;
  version: string;
}
