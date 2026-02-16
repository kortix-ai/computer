'use client';

import { useEffect, useState } from 'react';
import { getSupabaseAccessToken } from '@/lib/auth-token';

/**
 * Appends the current Supabase JWT as a `?token=` query parameter
 * to a preview proxy URL so that the backend `supabaseAuthWithQueryParam`
 * middleware can authenticate iframe requests.
 *
 * Only injects the token for cloud preview URLs (those containing `/preview/`).
 * Local/direct URLs are returned unchanged.
 *
 * The token is refreshed every 30 seconds to avoid expiry issues.
 *
 * @param previewUrl - The proxy URL for the preview iframe
 * @returns The URL with `?token=<jwt>` appended (or the original URL if local)
 */
export function useAuthenticatedPreviewUrl(previewUrl: string): string {
  const [authenticatedUrl, setAuthenticatedUrl] = useState(previewUrl);

  useEffect(() => {
    if (!previewUrl) {
      setAuthenticatedUrl(previewUrl);
      return;
    }

    // Only inject token for cloud preview proxy URLs
    const isCloudPreview = previewUrl.includes('/preview/');
    if (!isCloudPreview) {
      setAuthenticatedUrl(previewUrl);
      return;
    }

    let cancelled = false;

    async function injectToken() {
      const token = await getSupabaseAccessToken();
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
