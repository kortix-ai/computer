'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { tabs, setActiveTab } = useTabStore();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const tabId = 'services:running';
    const existingTab = tabs[tabId];

    if (existingTab) {
      setActiveTab(tabId);
    } else {
      router.replace('/dashboard');
    }
  }, [tabs, setActiveTab, router]);

  return null;
}
