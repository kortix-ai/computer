'use client';

import { Suspense, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackSignUp, trackLogin, AuthMethod } from '@/lib/analytics/gtm';
import { useLocationSearch } from '@/hooks/utils';

/**
 * Tracks auth events (sign_up, login) from URL parameters
 * after OAuth/magic link redirects
 */
function AuthEventTrackerContent() {
  const pathname = usePathname();
  const search = useLocationSearch();

  useEffect(() => {
    const searchParams = new URLSearchParams(search);
    const authEvent = searchParams.get('auth_event');
    const authMethod = searchParams.get('auth_method');

    if (authEvent && authMethod) {
      // Map provider to AuthMethod format
      const method: AuthMethod = 
        authMethod === 'google' ? 'Google' :
        authMethod === 'apple' ? 'Apple' :
        authMethod === 'github' ? 'GitHub' : 'Email';

      if (authEvent === 'signup') {
        trackSignUp(method);
      } else if (authEvent === 'login') {
        trackLogin(method);
      }

      // Clean up URL params after tracking
      const params = new URLSearchParams(searchParams.toString());
      params.delete('auth_event');
      params.delete('auth_method');
      
      const newUrl = params.toString() 
        ? `${pathname}?${params.toString()}`
        : pathname;
      
      // Replace URL without triggering navigation
      window.history.replaceState({}, '', newUrl);
    }
  }, [search, pathname]);

  return null;
}

export function AuthEventTracker() {
  return (
    <Suspense fallback={null}>
      <AuthEventTrackerContent />
    </Suspense>
  );
}
