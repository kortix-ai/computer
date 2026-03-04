'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTabStore } from '@/stores/tab-store';

/**
 * Route for /terminal/<ptyId>
 *
 * When a terminal tab is open, the URL is set to /terminal/<ptyId> via pushState.
 * This page handles direct navigation (hard refresh, shared link) by opening
 * the terminal as a tab so the pre-mounted TerminalTabContent takes over rendering.
 */
export default function TerminalPage() {
  const params = useParams<{ id: string }>();
  const didOpen = useRef(false);

  const ptyId = params.id ?? '';

  useEffect(() => {
    if (!ptyId) return;

    // Only open once per mount — prevents re-opening after close.
    if (didOpen.current) return;
    didOpen.current = true;

    const tabId = `terminal:${ptyId}`;

    // Don't reopen if a tab with this ID already exists and is active
    const state = useTabStore.getState();
    if (state.tabs[tabId] && state.activeTabId === tabId) return;

    state.openTab({
      id: tabId,
      title: 'Terminal',
      type: 'terminal',
      href: `/terminal/${ptyId}`,
    });
  }, [ptyId]);

  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/80" />
    </div>
  );
}
