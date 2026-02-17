'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Drop-in replacement for useSearchParams() that avoids the Suspense boundary requirement.
 * Uses window.location.search directly, re-evaluating when pathname changes.
 */
export function useSearchParamsCompat(): URLSearchParams {
  const pathname = usePathname();
  // Re-evaluate search params whenever the pathname changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [pathname]);
}
