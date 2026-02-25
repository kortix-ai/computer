'use client';

import { useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/auth-token';

/**
 * Injects the current Supabase JWT as a `?token=` query parameter on preview
 * proxy URLs and **pre-authenticates** the subdomain before the iframe loads.
 *
 * Returns `null` while the token is being fetched and pre-auth is in progress.
 * Consumers MUST check for `null` and show a loading state — never render an
 * iframe with a null or unauthenticated URL.
 *
 * Flow:
 *   1. Fetch Supabase JWT via `getAuthToken()`.
 *   2. Append `?token=<jwt>` to the proxy URL.
 *   3. Fire a HEAD request to that URL — this registers the subdomain in the
 *      backend's `authenticatedSubdomains` map so subsequent iframe loads
 *      (sub-resources, CSS, JS, WS) pass through without needing `?token=`.
 *   4. Once the HEAD succeeds (or fails — we proceed either way), expose the
 *      authenticated URL. The iframe can now load reliably on first attempt.
 *
 * The token is refreshed every 30 seconds to stay ahead of JWT expiry.
 *
 * @param previewUrl - The proxy URL for the preview iframe (or empty string)
 * @returns The URL with `?token=<jwt>` appended, or `null` while loading
 */
export function useAuthenticatedPreviewUrl(previewUrl: string): string | null {
  const [authenticatedUrl, setAuthenticatedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewUrl) {
      setAuthenticatedUrl(null);
      return;
    }

    let cancelled = false;

    async function authenticateAndExpose() {
      const token = await getAuthToken();
      if (cancelled) return;

      if (!token) {
        // No token available — expose bare URL (will likely 401, but nothing
        // we can do). Better than hanging in loading state forever.
        setAuthenticatedUrl(previewUrl);
        return;
      }

      let tokenizedUrl: string;
      try {
        const url = new URL(previewUrl);
        url.searchParams.set('token', token);
        tokenizedUrl = url.toString();
      } catch {
        // URL parsing failed — simple concatenation fallback
        const separator = previewUrl.includes('?') ? '&' : '?';
        tokenizedUrl = `${previewUrl}${separator}token=${encodeURIComponent(token)}`;
      }

      // Pre-authenticate: fire a HEAD request so the backend marks this
      // subdomain as authenticated BEFORE the iframe loads. This eliminates
      // the race where the iframe's first GET arrives before auth is recorded.
      try {
        await fetch(tokenizedUrl, {
          method: 'HEAD',
          mode: 'no-cors',
          credentials: 'omit',
        });
      } catch {
        // Pre-auth failed (network error, CORS, etc.) — proceed anyway.
        // The iframe will carry ?token= and authenticate on its own GET.
      }

      if (cancelled) return;
      setAuthenticatedUrl(tokenizedUrl);
    }

    // Reset to null on every previewUrl change so consumers show loading
    setAuthenticatedUrl(null);
    authenticateAndExpose();

    // Refresh token periodically (Supabase tokens expire; re-fetch every 30s)
    const interval = setInterval(() => {
      // On refresh, don't reset to null — just update the URL in-place
      // to avoid flickering the iframe
      (async () => {
        const token = await getAuthToken();
        if (cancelled || !token) return;
        try {
          const url = new URL(previewUrl);
          url.searchParams.set('token', token);
          setAuthenticatedUrl(url.toString());
        } catch {
          const separator = previewUrl.includes('?') ? '&' : '?';
          setAuthenticatedUrl(`${previewUrl}${separator}token=${encodeURIComponent(token)}`);
        }
      })();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [previewUrl]);

  return authenticatedUrl;
}
