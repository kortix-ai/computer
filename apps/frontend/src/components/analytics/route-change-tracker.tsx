'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackRouteChange } from '@/lib/analytics/gtm';
import { useLocationSearch } from '@/hooks/utils';

/**
 * RouteChangeTracker Component
 * 
 * Tracks route changes in the Next.js app router and pushes
 * routeChange events to Google Tag Manager's dataLayer.
 * 
 * This solves the SPA tracking problem where page views aren't
 * automatically tracked on client-side navigation.
 */
function RouteChangeTrackerContent() {
  const pathname = usePathname();
  const search = useLocationSearch();
  const isInitialMount = useRef(true);
  
  useEffect(() => {
    // On initial mount, track the current page
    if (isInitialMount.current) {
      isInitialMount.current = false;
      
      // Small delay to ensure document.title is set
      const timeoutId = setTimeout(() => {
        trackRouteChange(pathname, search.startsWith('?') ? search.slice(1) : search);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
    
    // Track subsequent route changes
    trackRouteChange(pathname, search.startsWith('?') ? search.slice(1) : search);
  }, [pathname, search]);
  
  // This component doesn't render anything
  return null;
}

export function RouteChangeTracker() {
  return (
    <Suspense fallback={null}>
      <RouteChangeTrackerContent />
    </Suspense>
  );
}
