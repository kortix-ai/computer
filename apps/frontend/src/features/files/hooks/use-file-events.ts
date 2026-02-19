'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { getAuthToken } from '@/lib/auth-token';
import { fileListKeys } from './use-file-list';
import { fileContentKeys } from './use-file-content';
import { gitStatusKeys } from './use-git-status';

/**
 * Listen for OpenCode SSE events and invalidate file queries when
 * files are edited or the file watcher detects changes.
 *
 * Events handled:
 *  - file.edited       — a file was edited by the agent
 *  - file.watcher.updated — the file watcher detected a change (add/change/unlink)
 *
 * For remote instances, the Supabase JWT is appended as a query parameter
 * since the EventSource API doesn't support custom headers.
 *
 * This should be mounted once, e.g., in the Files page or a global provider.
 */
export function useFileEventInvalidation() {
  const queryClient = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const urlVersion = useServerStore((s) => s.urlVersion);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;

      try {
        const baseEventUrl = `${getActiveOpenCodeUrl()}/event`;

        // Attach auth token as query param (EventSource doesn't support custom headers)
        const token = await getAuthToken();
        const eventUrl = token
          ? `${baseEventUrl}${baseEventUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
          : baseEventUrl;

        eventSource = new EventSource(eventUrl);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const eventType = data?.type;

            if (
              eventType === 'file.edited' ||
              eventType === 'file.watcher.updated'
            ) {
              // Invalidate all file list queries to refresh directory contents
              queryClient.invalidateQueries({
                queryKey: fileListKeys.all,
              });

              // Invalidate git status (file changes affect git status)
              queryClient.invalidateQueries({
                queryKey: gitStatusKeys.all,
              });

              // If a specific file was edited, invalidate its content query
              const filePath =
                data?.properties?.file || data?.properties?.path;
              if (filePath && typeof filePath === 'string') {
                queryClient.invalidateQueries({
                  queryKey: fileContentKeys.file(serverUrl, filePath),
                });
              }
            }
          } catch {
            // Ignore parse errors on SSE data
          }
        };

        eventSource.onerror = () => {
          eventSource?.close();
          if (!cancelled) {
            retryTimeout = setTimeout(connect, 5000);
          }
        };
      } catch {
        if (!cancelled) {
          retryTimeout = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [queryClient, serverUrl, urlVersion]);
}
