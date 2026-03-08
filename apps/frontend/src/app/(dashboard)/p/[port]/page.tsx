'use client';

import { use, useEffect } from 'react';
import { redirect } from 'next/navigation';
import { useTabStore } from '@/stores/tab-store';

/**
 * Preview route handler for /p/[port].
 *
 * Preview tabs are normally opened via the tab system (sidebar, sandbox URL detector)
 * which uses pushState for URL changes. This page handles direct navigation to
 * /p/[port] (e.g. browser refresh, link sharing).
 *
 * If a preview tab for this port already exists in the store, it activates it.
 * Otherwise, it redirects to the dashboard since we don't have the sandbox URL
 * needed to create a preview tab.
 */
export default function PreviewPage({
  params,
}: {
  params: Promise<{ port: string }>;
}) {
  const { port } = use(params);
  const { tabs, setActiveTab } = useTabStore();
  const tabId = `preview:${port}`;
  const existingTab = tabs[tabId];

  useEffect(() => {
    if (existingTab) {
      setActiveTab(tabId);
    }
  }, [existingTab, setActiveTab, tabId]);

  if (!existingTab) {
    redirect('/dashboard');
  }

  // The actual preview content is rendered by SessionTabsContainer in layout-content.tsx
  // This page renders nothing visible - it just ensures the tab is activated
  return null;
}
