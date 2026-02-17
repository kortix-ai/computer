'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { navigateReplace } from '@/lib/utils/navigate';

/**
 * /setup — redirects to /dashboard.
 * Setup is now an overlay inside the dashboard layout (SetupOverlay).
 * This page exists only so that the installer's auto-open URL still works.
 */
export default function SetupPageClient() {
  const router = useRouter();

  useEffect(() => {
    navigateReplace(router, '/dashboard');
  }, [router]);

  return null;
}
