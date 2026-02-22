'use client';

/**
 * Global catch-all that intercepts clicks on ANY <a> tag whose href points to
 * localhost:PORT (or 127.0.0.1:PORT) and opens it in the preview tab instead
 * of navigating the browser to an unreachable address.
 *
 * Also intercepts clicks on already-proxied URLs (e.g. links whose href was
 * rewritten by the markdown renderer to go through the backend preview proxy)
 * so that they open as preview tabs instead of navigating the top-level page.
 *
 * Mount once at the app root — it uses a single delegated listener on
 * `document` so every link in the tree is covered automatically, including
 * links rendered by tool views, JSON viewers, markdown, etc.
 */

import { useEffect } from 'react';
import { useServerStore, getActiveOpenCodeUrl, getSubdomainOpts } from '@/stores/server-store';
import {
  isProxiableLocalhostUrl,
  parseLocalhostUrl,
  proxyUrlToInternal,
  isPreviewUrl,
  rewriteLocalhostUrl,
  toInternalUrl,
} from '@/lib/utils/sandbox-url';
import { openTabAndNavigate } from '@/stores/tab-store';

export function LocalhostLinkInterceptor() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Only intercept plain left-clicks (no modifier keys)
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Walk up from the click target to find the nearest <a>
      const anchor = (e.target as HTMLElement)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.href; // resolved absolute URL
      if (!href) return;

      // Never intercept links pointing at the app itself (same origin)
      try {
        if (new URL(href).origin === window.location.origin) return;
      } catch { /* not a valid URL, skip */ }

      // Resolve the proxy URL using the active server
      const state = useServerStore.getState();
      const activeServer =
        state.servers.find((s) => s.id === state.activeServerId) ?? null;
      const serverUrl = activeServer?.url || getActiveOpenCodeUrl();
      const subdomainOpts = getSubdomainOpts();

      // ── Case 1: Fresh localhost:PORT URL (not yet proxied) ──
      if (isProxiableLocalhostUrl(href)) {
        const parsed = parseLocalhostUrl(href);
        if (!parsed) return;

        const { port, path } = parsed;
        const proxyUrl = rewriteLocalhostUrl(port, path, serverUrl, subdomainOpts);
        const internalUrl = toInternalUrl(port, path);

        e.preventDefault();
        e.stopPropagation();

        openTabAndNavigate({
          id: `preview:${port}`,
          title: `localhost:${port}`,
          type: 'preview',
          href: `/preview/${port}`,
          metadata: { url: proxyUrl, port, originalUrl: internalUrl, path },
        });
        return;
      }

      // ── Case 2: Already-proxied URL (subdomain or path-based) ──
      // The href is something like http://p3210-kortix-sandbox.localhost:8008/
      // or http://localhost:8008/v1/preview/.../proxy/3210/
      // which would navigate the browser away from the app. Instead, open as tab.
      if (isPreviewUrl(href)) {
        const internal = proxyUrlToInternal(href, activeServer?.mappedPorts);
        if (internal) {
          const parsed = parseLocalhostUrl(internal);
          if (parsed) {
            const { port, path } = parsed;
            const proxyUrl = rewriteLocalhostUrl(port, path, serverUrl, subdomainOpts);
            const internalUrl = toInternalUrl(port, path);

            e.preventDefault();
            e.stopPropagation();

            openTabAndNavigate({
              id: `preview:${port}`,
              title: `localhost:${port}`,
              type: 'preview',
              href: `/preview/${port}`,
              metadata: { url: proxyUrl, port, originalUrl: internalUrl, path },
            });
            return;
          }
        }
      }
    }

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  return null;
}
