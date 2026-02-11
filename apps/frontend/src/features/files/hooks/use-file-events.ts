'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { fileListKeys } from './use-file-list';
import { fileContentKeys } from './use-file-content';

/**
 * Listen for OpenCode SSE events and invalidate file queries when
 * files are edited or the file watcher detects changes.
 *
 * Events handled:
 *  - file.edited       — a file was edited by the agent
 *  - file.watcher.updated — the file watcher detected a change (add/change/unlink)
 *
 * This should be mounted once, e.g., in the Files page or a global provider.
 */
export function useFileEventInvalidation() {
  const queryClient = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const serverVersion = useServerStore((s) => s.serverVersion);

  useEffect(() => {
    const eventUrl = `${getActiveOpenCodeUrl()}/event`;
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
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
          // Reconnect after 5 seconds
          retryTimeout = setTimeout(connect, 5000);
        };
      } catch {
        // Server not reachable — retry later
        retryTimeout = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [queryClient, serverUrl, serverVersion]);
}
