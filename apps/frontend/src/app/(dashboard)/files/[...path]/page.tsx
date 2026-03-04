'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTabStore } from '@/stores/tab-store';

/**
 * Fully decode a string that may be multi-encoded.
 * e.g. "presentations%252Fslide.html" → "presentations%2Fslide.html" → "presentations/slide.html"
 */
function fullyDecode(value: string): string {
  let prev = value;
  for (let i = 0; i < 5; i++) {
    const decoded = decodeURIComponent(prev);
    if (decoded === prev) return decoded;
    prev = decoded;
  }
  return prev;
}

/**
 * Catch-all route for /files/<encoded-file-path>
 *
 * When a file is opened in the app, the URL is updated via pushState to
 * /files/<encodedPath> for shareability. This page handles direct navigation
 * (hard refresh, shared link) by opening the file as a tab so the pre-mounted
 * FileTabContent takes over rendering.
 */
export default function FilePathPage() {
  const params = useParams<{ path: string[] }>();
  const didOpen = useRef(false);

  // Build a stable string key from the path segments so the effect
  // doesn't re-fire on every render due to array identity changes.
  const pathKey = params.path?.join('/') ?? '';

  useEffect(() => {
    if (!pathKey) return;

    // Only open once per mount — prevents re-opening after close.
    if (didOpen.current) return;
    didOpen.current = true;

    // Next.js already decodes each path segment, but the original URL
    // may have been double-encoded (e.g. %252F). Fully decode to get
    // the real file path.
    const filePath = fullyDecode(pathKey);
    const fileName = filePath.split('/').pop() || filePath;
    const tabId = `file:${filePath}`;

    // Don't reopen if a tab with this ID already exists and is active
    const state = useTabStore.getState();
    if (state.tabs[tabId] && state.activeTabId === tabId) return;

    state.openTab({
      id: tabId,
      title: fileName,
      type: 'file',
      href: `/files/${encodeURIComponent(filePath)}`,
    });
  }, [pathKey]);

  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/80" />
    </div>
  );
}
