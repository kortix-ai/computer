/**
 * OpenCode File API — filesystem access via the SDK client.
 *
 * All calls go through the `@kortix/opencode-sdk` client singleton,
 * which handles base URL, headers, and error handling consistently.
 *
 * Read endpoints: list, read, status, find
 * Write endpoints: upload, delete, mkdir, rename
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
// Binary helpers — fetch raw file bytes from /file/raw and trigger download
// ---------------------------------------------------------------------------

/**
 * Fetch a file as a Blob via the `/file/raw` endpoint.
 *
 * This uses a dedicated binary endpoint that streams the raw file bytes
 * instead of wrapping them in JSON. This is critical because the JSON
 * `/file/content` endpoint returns `content: ""` for binary files
 * (PDF, DOCX, PPTX, XLSX, videos, archives, etc.), making downloads of
 * those files impossible through the old readFile() path.
 *
 * Falls back to decoding the JSON readFile() response only for text files
 * where the raw endpoint isn't necessary (but still works).
 */
export async function readFileAsBlob(filePath: string): Promise<Blob> {
  const baseUrl = getActiveOpenCodeUrl();
  const url = `${baseUrl}/file/raw?path=${encodeURIComponent(filePath)}`;

  const response = await authenticatedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to fetch file (${response.status}): ${text || response.statusText}`,
    );
  }

  return response.blob();
}

/**
 * Download a file from the project to the user's machine.
 *
 * Uses the `/file/raw` binary endpoint to fetch the actual file bytes
 * and triggers a browser download via a temporary <a> element.
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
  const client = getClient();
  const rawPath = (targetPath ?? '').trim();
  const normalizedPath =
    !rawPath || rawPath === '/' || rawPath === '.'
      ? '/workspace'
      : rawPath.startsWith('/')
        ? rawPath
        : `/${rawPath}`;
  const result = await client.file.upload({ file, path: normalizedPath });
  return unwrap(result) as UploadResult[];
}

/**
 * Delete a file or directory (recursively).
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  const client = getClient();
  const result = await client.file.delete({ path: filePath });
  return unwrap(result);
}

/**
 * Create a directory (recursive, idempotent).
 */
export async function mkdirFile(dirPath: string): Promise<boolean> {
  const client = getClient();
  const result = await client.file.mkdir({ path: dirPath });
  return unwrap(result);
}

/**
 * Upload a file to a specific path using the field-name-as-path convention.
 *
 * The generated SDK's `client.file.upload()` doesn't correctly pass the
 * filename through FormData serialization, so we build the request manually
 * using the approach documented by the hand-written SDK helper: set the
 * FormData field name to the desired relative path.
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
  const client = getClient();
  const result = await client.file.rename({ from, to });
  return unwrap(result);
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
