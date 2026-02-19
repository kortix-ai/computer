'use client';

/**
 * Global catch-all that intercepts clicks on ANY <a> tag whose href points to
 * localhost:PORT (or 127.0.0.1:PORT) and opens it in the preview tab instead
 * of navigating the browser to an unreachable address.
 *
 * Mount once at the app root — it uses a single delegated listener on
 * `document` so every link in the tree is covered automatically, including
 * links rendered by tool views, JSON viewers, markdown, etc.
 */

import { useEffect } from 'react';
import { useServerStore, getActiveOpenCodeUrl } from '@/stores/server-store';
import { isProxiableLocalhostUrl, rewriteLocalhostUrl } from '@/lib/utils/sandbox-url';
import { openTabAndNavigate } from '@/stores/tab-store';

const LOCALHOST_HREF_RE =
  /^https?:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})(\/[^\s)"'<>]*)?$/;

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
      if (!href || !isProxiableLocalhostUrl(href)) return;

      // Never intercept links pointing at the app itself (same origin)
      try {
        if (new URL(href).origin === window.location.origin) return;
      } catch { /* not a valid URL, skip */ }

      const match = href.match(LOCALHOST_HREF_RE);
      if (!match) return;

      const port = parseInt(match[1], 10);
      const path = match[2] || '/';

      // Resolve the proxy URL using the active server
      const state = useServerStore.getState();
      const activeServer =
        state.servers.find((s) => s.id === state.activeServerId) ?? null;
      const serverUrl = activeServer?.url || getActiveOpenCodeUrl();
      const proxyUrl = rewriteLocalhostUrl(port, path, serverUrl);

      e.preventDefault();
      e.stopPropagation();

      openTabAndNavigate({
        id: `preview:${port}`,
        title: `localhost:${port}`,
        type: 'preview',
        href: `/preview/${port}`,
        metadata: { url: proxyUrl, port, originalUrl: href, path },
      });
    }

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  return null;
}
