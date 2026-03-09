'use client';

import { useEffect } from 'react';
import { redirect } from 'next/navigation';
import { useTabStore } from '@/stores/tab-store';

/**
 * Route handler for /services/running.
 *
 * The Running Services tab is normally opened via the sidebar action button
 * which uses pushState for URL changes. This page handles direct navigation
 * (e.g. browser refresh, link sharing).
 *
 * If the services tab already exists in the store, it activates it.
 * Otherwise, it redirects to the dashboard (the tab can only be created
 * via the sidebar action).
 */
export default function RunningServicesPage() {
  const { tabs, setActiveTab } = useTabStore();
  const tabId = 'services:running';
  const existingTab = tabs[tabId];

  useEffect(() => {
    if (existingTab) {
      setActiveTab(tabId);
    }
  }, [existingTab, setActiveTab, tabId]);

  if (!existingTab) {
    redirect('/dashboard');
  }

  return null;
}
