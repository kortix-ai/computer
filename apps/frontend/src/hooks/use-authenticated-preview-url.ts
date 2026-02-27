'use client';

import { useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/auth-token';

/**
 * Pre-authenticates preview proxy URLs via cookie-based auth.
 *
 * Returns `null` while authentication is in progress.
 * Consumers MUST check for `null` and show a loading state — never render an
 * iframe with a null or unauthenticated URL.
 *
 * Flow:
 *   1. Fetch Supabase JWT via `getAuthToken()`.
 *   2. Call `POST /v1/p/auth` with `Authorization: Bearer <jwt>` — the backend
 *      validates the token and sets a `__preview_session` HttpOnly cookie.
 *   3. Return the bare preview URL (no `?token=` appended). The cookie handles
 *      auth for all subsequent requests (iframe loads, sub-resources, WS).
 *
 * The cookie is refreshed every 55 seconds to stay ahead of the 1-hour expiry.
 * Also re-authenticates the subdomain map for local-mode previews.
 *
 * @param previewUrl - The proxy URL for the preview iframe (or empty string)
 * @returns The bare preview URL once authenticated, or `null` while loading
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

      // Derive the auth endpoint from the preview URL.
      // Preview URLs look like: http://host/v1/p/{sandboxId}/{port}/...
      // Auth endpoint is:        http://host/v1/p/auth
      let authEndpoint: string;
      try {
        const url = new URL(previewUrl);
        // Find /v1/p/ in the pathname and build the auth URL
        const pIndex = url.pathname.indexOf('/v1/p/');
        if (pIndex !== -1) {
          authEndpoint = `${url.origin}${url.pathname.slice(0, pIndex)}/v1/p/auth`;
        } else {
          // Fallback: assume the origin is the API host
          authEndpoint = `${url.origin}/v1/p/auth`;
        }
      } catch {
        // URL parsing failed — can't authenticate
        setAuthenticatedUrl(previewUrl);
        return;
      }

      // Authenticate via POST — sets __preview_session cookie
      try {
        await fetch(authEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        // Auth endpoint failed — expose bare URL anyway (will 401 on load,
        // but better than hanging forever).
      }

      // Also pre-authenticate the subdomain (local mode uses an in-memory
      // map keyed by subdomain, authenticated via a HEAD request with Bearer)
      try {
        await fetch(previewUrl, {
          method: 'HEAD',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch {
        // Pre-auth failed — proceed anyway, cookie should handle it.
      }

      if (cancelled) return;
      setAuthenticatedUrl(previewUrl);
    }

    // Reset to null on every previewUrl change so consumers show loading
    setAuthenticatedUrl(null);
    authenticateAndExpose();

    // Refresh cookie periodically (cookie has 1-hour Max-Age; refresh every 55s)
    const interval = setInterval(() => {
      (async () => {
        const token = await getAuthToken();
        if (cancelled || !token) return;

        let authEndpoint: string;
        try {
          const url = new URL(previewUrl);
          const pIndex = url.pathname.indexOf('/v1/p/');
          authEndpoint = pIndex !== -1
            ? `${url.origin}${url.pathname.slice(0, pIndex)}/v1/p/auth`
            : `${url.origin}/v1/p/auth`;
        } catch {
          return;
        }

        try {
          await fetch(authEndpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
        } catch {
          // Refresh failed — cookie is still valid for a while
        }
      })();
    }, 55_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [previewUrl]);

  return authenticatedUrl;
}
