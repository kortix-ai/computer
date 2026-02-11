/**
 * OpenCode File API — filesystem access via the active OpenCode server.
 *
 * All calls go through the @kortix/opencode-sdk client singleton.
 *
 * Read endpoints: list, read, status, find
 * Write endpoints: upload, delete, mkdir, rename
 */

import { getClient } from '@/lib/opencode-sdk';
import type {
  FileNode,
  FileContent,
  FindMatch,
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
  return unwrap(result);
}

/**
 * Read the content of a file.
 * Returns text content for text files, base64-encoded content for images/binaries.
 */
export async function readFile(filePath: string): Promise<FileContent> {
  const client = getClient();
  const result = await client.file.read({ path: filePath });
  return unwrap(result);
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
  const result = await client.file.upload({ file, path: targetPath });
  return unwrap(result);
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
 * Create a directory, including any missing parent directories.
 */
export async function mkdirFile(dirPath: string): Promise<boolean> {
  const client = getClient();
  const result = await client.file.mkdir({ path: dirPath });
  return unwrap(result);
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
  // SDK returns { path: { text }, lines: { text }, submatches: [{ match, start, end }] }
  // Normalize to our FindMatch shape
  return raw.map((m) => ({
    path: typeof m.path === 'string' ? m.path : m.path?.text ?? '',
    lines: typeof m.lines === 'string' ? m.lines : m.lines?.text ?? '',
    line_number: m.line_number,
    absolute_offset: m.absolute_offset,
    submatches: (m.submatches ?? []).map((s: any) => ({
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
  return unwrap(result);
}

/**
 * Server health check.
 */
export async function getServerHealth(): Promise<ServerHealth> {
  const client = getClient();
  const result = await client.global.health();
  return unwrap(result);
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
