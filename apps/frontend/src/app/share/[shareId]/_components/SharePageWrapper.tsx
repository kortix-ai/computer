'use client';

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppProviders } from '@/components/layout/app-providers';

const PresentationViewerWrapper = lazy(() =>
  import('@/stores/presentation-viewer-store').then(mod => ({ default: mod.PresentationViewerWrapper }))
);

export function SharePageWrapper({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        setIsLoggedIn(!!session);
      } catch {
        setIsLoggedIn(false);
      } finally {
        setIsChecking(false);
      }
    };
    checkAuth();
  }, []);

  if (isChecking) {
    return <div className="flex-1">{children}</div>;
  }

  if (isLoggedIn) {
    return (
      <AppProviders showSidebar={false}>
        {children}
        <Suspense fallback={null}>
          <PresentationViewerWrapper />
        </Suspense>
      </AppProviders>
    );
  }

  return (
    <div className="flex-1">
      {children}
      <Suspense fallback={null}>
        <PresentationViewerWrapper />
      </Suspense>
    </div>
  );
}
