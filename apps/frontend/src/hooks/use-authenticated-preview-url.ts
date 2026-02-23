'use client';

import { useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/auth-token';

/**
 * Injects the current Supabase JWT as a `?token=` query parameter on preview
 * proxy URLs so the backend can authenticate the initial iframe load.
 *
 * On the first successful request, the backend sets a `__preview_session`
 * host-only cookie so all subsequent sub-resource requests (CSS, JS, images,
 * fonts, WebSocket upgrades, etc.) are authenticated via cookie automatically
 * — no ?token= needed on every URL.
 *
 * This works for both:
 *   - Subdomain URLs: http://p3210-kortix-sandbox.localhost:8008/?token=JWT
 *   - Path-based URLs: http://localhost:8008/v1/preview/.../proxy/3210/?token=JWT
 *
 * The token is refreshed every 30 seconds to stay ahead of JWT expiry.
 *
 * @param previewUrl - The proxy URL for the preview iframe
 * @returns The URL with `?token=<jwt>` appended
 */
export function useAuthenticatedPreviewUrl(previewUrl: string): string {
  const [authenticatedUrl, setAuthenticatedUrl] = useState(previewUrl);

  useEffect(() => {
    if (!previewUrl) {
      setAuthenticatedUrl(previewUrl);
      return;
    }

    let cancelled = false;

    async function injectToken() {
      const token = await getAuthToken();
      if (cancelled) return;

      if (token) {
        try {
          const url = new URL(previewUrl);
          url.searchParams.set('token', token);
          setAuthenticatedUrl(url.toString());
        } catch {
          // If URL parsing fails, fall back to simple concatenation
          const separator = previewUrl.includes('?') ? '&' : '?';
          setAuthenticatedUrl(`${previewUrl}${separator}token=${encodeURIComponent(token)}`);
        }
      } else {
        // No token available — use URL as-is (will likely 401)
        setAuthenticatedUrl(previewUrl);
      }
    }

    injectToken();

    // Refresh token periodically (Supabase tokens expire; re-fetch every 30s)
    const interval = setInterval(injectToken, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [previewUrl]);

  return authenticatedUrl;
}
