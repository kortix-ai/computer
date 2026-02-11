/**
 * OpenCode File API — filesystem access via the active OpenCode server.
 *
 * All calls go directly to the OpenCode server (e.g. localhost:4096).
 * No auth tokens, no sandbox IDs, no backend proxy.
 *
 * Read endpoints: list, read, status, find
 * Write endpoints: upload, delete, mkdir, rename (requires kortix fork)
 */

import { getActiveOpenCodeUrl } from '@/stores/server-store';
import type {
  FileNode,
  FileContent,
  FindMatch,
  OpenCodeProjectInfo,
  ServerHealth,
} from '../types';

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function opencodeFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const baseUrl = getActiveOpenCodeUrl();
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenCode ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * List files and directories at a given path.
 * GET /file?path=<path>
 */
export async function listFiles(dirPath: string): Promise<FileNode[]> {
  return opencodeFetch<FileNode[]>(
    `/file?path=${encodeURIComponent(dirPath)}`,
  );
}

/**
 * Read the content of a file.
 * GET /file/content?path=<path>
 *
 * Returns text content for text files, base64-encoded content for images/binaries.
 */
export async function readFile(filePath: string): Promise<FileContent> {
  return opencodeFetch<FileContent>(
    `/file/content?path=${encodeURIComponent(filePath)}`,
  );
}

// ---------------------------------------------------------------------------
// Binary helpers — decode readFile() response into Blob / trigger download
// ---------------------------------------------------------------------------

/**
 * Convert a readFile() response into a Blob.
 * Handles both base64-encoded binary and plain text content.
 */
export async function readFileAsBlob(filePath: string): Promise<Blob> {
  const result = await readFile(filePath);
  const bytes =
    result.encoding === 'base64'
      ? Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(result.content);
  return new Blob([bytes], {
    type: result.mimeType || 'application/octet-stream',
  });
}

/**
 * Download a file from the project to the user's machine.
 * Uses readFile() under the hood and triggers a browser download.
 */
export async function downloadFile(
  filePath: string,
  fileName?: string,
): Promise<void> {
  const blob = await readFileAsBlob(filePath);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || filePath.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// File mutations (write operations — requires kortix opencode fork)
// ---------------------------------------------------------------------------

/** Response from the upload endpoint. */
export interface UploadResult {
  path: string;
  size: number;
}

/**
 * Upload a file to the project.
 * POST /file/upload (multipart/form-data)
 *
 * @param file - The file or blob to upload
 * @param targetPath - Optional target directory (relative to project root)
 */
export async function uploadFile(
  file: File | Blob,
  targetPath?: string,
): Promise<UploadResult[]> {
  const baseUrl = getActiveOpenCodeUrl();
  const formData = new FormData();
  formData.append('file', file);
  if (targetPath) {
    formData.append('path', targetPath);
  }

  const res = await fetch(`${baseUrl}/file/upload`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — browser sets multipart boundary automatically
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenCode ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Delete a file or directory (recursively).
 * DELETE /file  body: { path }
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  return opencodeFetch<boolean>('/file', {
    method: 'DELETE',
    body: JSON.stringify({ path: filePath }),
  });
}

/**
 * Create a directory (recursive, idempotent).
 * POST /file/mkdir  body: { path }
 */
export async function mkdirFile(dirPath: string): Promise<boolean> {
  return opencodeFetch<boolean>('/file/mkdir', {
    method: 'POST',
    body: JSON.stringify({ path: dirPath }),
  });
}

/**
 * Rename or move a file/directory.
 * POST /file/rename  body: { from, to }
 */
export async function renameFile(from: string, to: string): Promise<boolean> {
  return opencodeFetch<boolean>('/file/rename', {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

// ---------------------------------------------------------------------------
// Search operations
// ---------------------------------------------------------------------------

/**
 * Find files and directories by name (fuzzy match).
 * GET /find/file?query=<q>&type=file|directory&limit=N
 */
export async function findFiles(
  query: string,
  options?: { type?: 'file' | 'directory'; limit?: number },
): Promise<string[]> {
  const params = new URLSearchParams({ query });
  if (options?.type) params.set('type', options.type);
  if (options?.limit) params.set('limit', String(options.limit));
  return opencodeFetch<string[]>(`/find/file?${params.toString()}`);
}

/**
 * Search for text patterns across project files (ripgrep).
 * GET /find?pattern=<pat>
 */
export async function findText(pattern: string): Promise<FindMatch[]> {
  return opencodeFetch<FindMatch[]>(
    `/find?pattern=${encodeURIComponent(pattern)}`,
  );
}

// ---------------------------------------------------------------------------
// Project / server info
// ---------------------------------------------------------------------------

/**
 * Get current project information.
 * GET /project/current
 */
export async function getCurrentProject(): Promise<OpenCodeProjectInfo> {
  return opencodeFetch<OpenCodeProjectInfo>('/project/current');
}

/**
 * Server health check.
 * GET /global/health
 */
export async function getServerHealth(): Promise<ServerHealth> {
  return opencodeFetch<ServerHealth>('/global/health');
}

/**
 * Check if the OpenCode server is reachable.
 * Returns true/false without throwing.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    const health = await getServerHealth();
    return health.healthy === true;
  } catch {
    return false;
  }
}
