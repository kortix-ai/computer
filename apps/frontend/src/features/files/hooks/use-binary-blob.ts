'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { readFileAsBlob } from '../api/opencode-files';

// ── Query keys ─────────────────────────────────────────────────────────────

export const binaryBlobKeys = {
  all: ['opencode-files', 'binary-blob'] as const,
  file: (serverUrl: string, serverVersion: number, filePath: string) =>
    ['opencode-files', 'binary-blob', serverUrl, serverVersion, filePath] as const,
};

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Load a file from the sandbox as a binary Blob via React Query.
 *
 * Returns both a blob URL (for <video>, <audio>, PdfRenderer, etc.)
 * and the raw Blob (for DocxRenderer, PptxRenderer).
 *
 * Pass `null` for filePath to disable loading.
 *
 * Uses the same React Query pattern as `useFileContent`:
 *  - `serverUrl` in the query key → cache miss when URL changes
 *  - `serverVersion` in the query key → guaranteed re-fetch when the
 *    sandbox registers (even if the URL string stays the same, e.g.
 *    local mode where DEFAULT_SANDBOX_URL == real sandbox URL)
 *  - Built-in retry with exponential backoff (no console spam)
 *  - Automatic garbage collection after gcTime
 */
export function useBinaryBlob(filePath: string | null): {
  blobUrl: string | null;
  blob: Blob | null;
  isLoading: boolean;
  error: string | null;
} {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const serverVersion = useServerStore((s) => s.serverVersion);

  const query = useQuery<{ blobUrl: string; blob: Blob }>({
    queryKey: filePath
      ? binaryBlobKeys.file(serverUrl, serverVersion, filePath)
      : ['opencode-files', 'binary-blob', '__disabled__'],
    queryFn: async () => {
      const blob = await readFileAsBlob(filePath!);
      if (blob.size === 0) {
        throw new Error('File is empty (0 bytes). It may still be generating — try again in a moment.');
      }
      const url = URL.createObjectURL(blob);
      return { blobUrl: url, blob };
    },
    enabled: !!filePath,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: Error) => {
      // Don't retry on 404 / 403 — those are permanent failures
      if (error.message.includes('404') || error.message.includes('403')) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 5000),
  });

  // ── Blob URL memory management ───────────────────────────────────────
  // Blob URLs are browser-managed and need explicit revocation.
  // Track the current blobUrl and revoke stale ones when the query data
  // changes (new key → new fetch → new blobUrl) or on unmount.
  const prevBlobUrlRef = useRef<string | null>(null);
  const currentBlobUrl = query.data?.blobUrl ?? null;

  useEffect(() => {
    // Revoke the PREVIOUS blobUrl when a new one arrives
    if (prevBlobUrlRef.current && prevBlobUrlRef.current !== currentBlobUrl) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
    }
    prevBlobUrlRef.current = currentBlobUrl;

    // Revoke on unmount
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = null;
      }
    };
  }, [currentBlobUrl]);

  // ── Stable return value ──────────────────────────────────────────────
  return useMemo(() => ({
    blobUrl: currentBlobUrl,
    blob: query.data?.blob ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  }), [currentBlobUrl, query.data?.blob, query.isLoading, query.error?.message]);
}
