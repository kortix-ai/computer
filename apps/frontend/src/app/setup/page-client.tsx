'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /setup — redirects to /dashboard.
 * Setup is now an overlay inside the dashboard layout (SetupOverlay).
 * This page exists only so that the installer's auto-open URL still works.
 */
export default function SetupPageClient() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
