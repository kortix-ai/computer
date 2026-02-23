/**
 * OpenCode File API — filesystem access via the SDK client + kortix-master.
 *
 * Read endpoints (list, read, status, find) go through the upstream
 * `@opencode-ai/sdk` client singleton which proxies to OpenCode.
 *
 * Write endpoints (upload, delete, mkdir, rename) and binary downloads
 * use `authenticatedFetch()` to hit kortix-master's /file/* routes
 * directly, since the upstream SDK has no write methods.
 */

import { getClient } from '@/lib/opencode-sdk';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { getAuthToken, authenticatedFetch } from '@/lib/auth-token';
import type {
  FileContent,
  FileNode,
  FindMatch,
  GitFileStatus,
  OpenCodeProjectInfo,
  ServerHealth,
} from '../types';

// ---------------------------------------------------------------------------
// Helper: unwrap SDK response (data / error)
// ---------------------------------------------------------------------------

function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error) {
    const err = result.error as any;
    throw new Error(err?.data?.message || err?.message || 'SDK request failed');
  }
  return result.data as T;
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * List files and directories at a given path.
 */
export async function listFiles(dirPath: string): Promise<FileNode[]> {
  const client = getClient();
  const result = await client.file.list({ path: dirPath });
  return unwrap(result) as FileNode[];
}

/**
 * Read the content of a file.
 * Returns text content for text files, base64-encoded content for images/binaries.
 */
export async function readFile(filePath: string): Promise<FileContent> {
  const client = getClient();
  const result = await client.file.read({ path: filePath });
  return unwrap(result) as FileContent;
}

// ---------------------------------------------------------------------------
// Binary helpers — fetch file bytes and trigger download
// ---------------------------------------------------------------------------

/**
 * Fetch a file as a Blob.
 *
 * Strategy:
 *   1. Try the `/file/raw` endpoint (streams raw bytes — best for binary files).
 *   2. If that 404s (older server without the route), fall back to the JSON
 *      `/file/content` endpoint and decode from base64 / text.
 *
 * The JSON endpoint now returns base64-encoded content for binary files,
 * so both paths produce correct output.
 */
export async function readFileAsBlob(filePath: string): Promise<Blob> {
  // ── Primary: /file/raw (binary stream) ──
  try {
    const baseUrl = getActiveOpenCodeUrl();
    const rawUrl = `${baseUrl}/file/raw?path=${encodeURIComponent(filePath)}`;
    const response = await authenticatedFetch(rawUrl);

    if (response.ok) {
      return response.blob();
    }

    // Only fall through on 404 (endpoint doesn't exist on this server).
    // Any other error (403, 500, etc.) should be thrown immediately.
    if (response.status !== 404) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Failed to fetch file (${response.status}): ${text || response.statusText}`,
      );
    }
  } catch (err) {
    // Network errors or non-404 HTTP errors — rethrow unless it's a 404
    // that was already handled above (the throw won't reach here).
    // If we reach here it's a genuine network failure; fall through to
    // the JSON endpoint as a last resort.
    if (err instanceof Error && !err.message.includes('404')) {
      // For non-404 errors from the raw endpoint, still try the JSON
      // fallback — the server may be partially available.
    }
  }

  // ── Fallback: /file/content (JSON with base64) ──
  const result = await readFile(filePath);
  if (result.encoding === 'base64' && result.content) {
    const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
    return new Blob([bytes], {
      type: result.mimeType || 'application/octet-stream',
    });
  }
  // Text content
  return new Blob([result.content], {
    type: result.mimeType || 'text/plain;charset=utf-8',
  });
}

/**
 * Download a file from the project to the user's machine.
 * Fetches via readFileAsBlob() and triggers a browser download.
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
// File mutations (write operations)
// ---------------------------------------------------------------------------

/** Response from the upload endpoint. */
export interface UploadResult {
  path: string;
  size: number;
}

/**
 * Upload a file to the project.
 *
 * @param file - The file or blob to upload
 * @param targetPath - Optional target directory (relative to project root)
 */
export async function uploadFile(
  file: File | Blob,
  targetPath?: string,
): Promise<UploadResult[]> {
  const baseUrl = getActiveOpenCodeUrl();
  const rawPath = (targetPath ?? '').trim();
  const normalizedPath =
    !rawPath || rawPath === '/' || rawPath === '.'
      ? '/workspace'
      : rawPath.startsWith('/')
        ? rawPath
        : `/${rawPath}`;

  const form = new FormData();
  form.append('path', normalizedPath);
  form.append('file', file);

  const res = await authenticatedFetch(`${baseUrl}/file/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Delete a file or directory (recursively).
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  const baseUrl = getActiveOpenCodeUrl();
  const res = await authenticatedFetch(`${baseUrl}/file`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Delete failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Create a directory (recursive, idempotent).
 */
export async function mkdirFile(dirPath: string): Promise<boolean> {
  const baseUrl = getActiveOpenCodeUrl();
  const res = await authenticatedFetch(`${baseUrl}/file/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mkdir failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Upload a file to a specific path using the field-name-as-path convention.
 *
 * Sets the FormData field name to the desired relative path so
 * kortix-master's /file/upload endpoint places it correctly.
 */
async function uploadToPath(
  filePath: string,
  content: Blob,
): Promise<UploadResult[]> {
  const baseUrl = getActiveOpenCodeUrl();

  const form = new FormData();
  const fileName = filePath.split('/').pop() || 'file';
  form.append(filePath, content, fileName);

  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}/file/upload`, {
    method: 'POST',
    body: form,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Create an empty file at the given path.
 *
 * Uses the SDK's uploadFile with a proper File object and target directory
 * so the server receives a named file entry it can place correctly.
 */
export async function createFile(filePath: string): Promise<UploadResult[]> {
  const rawPath = filePath.trim();
  const absolutePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const parts = absolutePath.split('/');
  const fileName = parts.pop() || 'untitled';
  const dirPath = parts.join('/') || '/workspace';
  const file = new File([' '], fileName, { type: 'application/octet-stream' });
  return uploadFile(file, dirPath);
}

/**
 * Copy a file from one location to another.
 * Reads the source file and uploads it to the destination.
 */
export async function copyFile(
  sourcePath: string,
  destPath: string,
): Promise<UploadResult[]> {
  const content = await readFileAsBlob(sourcePath);
  return uploadToPath(destPath, content);
}

/**
 * Rename or move a file/directory.
 */
export async function renameFile(from: string, to: string): Promise<boolean> {
  const baseUrl = getActiveOpenCodeUrl();
  const res = await authenticatedFetch(`${baseUrl}/file/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Rename failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

/**
 * Get git file status — lists files with uncommitted changes.
 */
export async function getFileStatus(): Promise<GitFileStatus[]> {
  const client = getClient();
  const result = await client.file.status();
  return unwrap(result) as GitFileStatus[];
}

// ---------------------------------------------------------------------------
// Search operations
// ---------------------------------------------------------------------------

/**
 * Find files and directories by name (fuzzy match).
 */
export async function findFiles(
  query: string,
  options?: { type?: 'file' | 'directory'; limit?: number },
): Promise<string[]> {
  const client = getClient();
  const result = await client.find.files({
    query,
    type: options?.type,
    limit: options?.limit,
  });
  return unwrap(result);
}

/**
 * Search for text patterns across project files (ripgrep).
 */
export async function findText(pattern: string): Promise<FindMatch[]> {
  const client = getClient();
  const result = await client.find.text({ pattern });
  const raw = unwrap(result) as any[];
  return raw.map((item) => ({
    path: typeof item.path === 'string' ? item.path : (item.path?.text ?? ''),
    lines:
      typeof item.lines === 'string' ? item.lines : (item.lines?.text ?? ''),
    line_number: item.line_number,
    absolute_offset: item.absolute_offset,
    submatches: (item.submatches ?? []).map((s: any) => ({
      start: s.start,
      end: s.end,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Project / server info
// ---------------------------------------------------------------------------

/**
 * Get current project information.
 */
export async function getCurrentProject(): Promise<OpenCodeProjectInfo> {
  const client = getClient();
  const result = await client.project.current();
  return unwrap(result) as OpenCodeProjectInfo;
}

/**
 * Server health check.
 */
export async function getServerHealth(): Promise<ServerHealth> {
  const client = getClient();
  const result = await client.global.health();
  return unwrap(result) as ServerHealth;
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
