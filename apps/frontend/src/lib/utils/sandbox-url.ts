/**
 * Sandbox URL detection and rewriting utilities.
 *
 * Detects localhost URLs in agent output (e.g. "Website is live at http://localhost:8080")
 * and rewrites them to be accessible through the proxy layer:
 *
 * Cloud mode:  http://localhost:8080 → {BACKEND_URL}/preview/{sandboxId}/8000/proxy/8080/
 * Local mode:  http://localhost:8080 → {serverUrl}/proxy/8080/
 */

import { SANDBOX_PORTS } from '@/lib/platform-client';

export interface DetectedLocalhostUrl {
  /** The original full URL found in text (e.g. "http://localhost:8080/api/docs") */
  originalUrl: string;
  /** The port number */
  port: number;
  /** The path portion after the port (e.g. "/api/docs") */
  path: string;
  /** Start index in the source text */
  startIndex: number;
  /** End index in the source text */
  endIndex: number;
}

/**
 * Regex to detect localhost URLs in text.
 * Matches: http://localhost:PORT, http://127.0.0.1:PORT, https://localhost:PORT
 * Captures optional path, query string, and fragment.
 * Does NOT match bare localhost without a port (too ambiguous).
 */
const LOCALHOST_URL_REGEX =
  /https?:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})(\/[^\s)"'<>]*)?/g;

/**
 * Ports that should NOT be rewritten — they're already exposed/handled natively
 * by the sandbox infrastructure (VNC, OpenCode Web, presentation viewer, etc.)
 */
const EXCLUDED_PORTS = new Set([
  3000,  // Next.js default dev port (the frontend itself)
  4096,  // OpenCode API (proxied by Kortix Master)
  parseInt(SANDBOX_PORTS.KORTIX_MASTER, 10),  // Kortix Master itself
]);

/**
 * Detect all localhost URLs in a text string.
 */
export function detectLocalhostUrls(text: string): DetectedLocalhostUrl[] {
  const results: DetectedLocalhostUrl[] = [];
  const seen = new Set<string>();

  // Reset regex state
  LOCALHOST_URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LOCALHOST_URL_REGEX.exec(text)) !== null) {
    const port = parseInt(match[1], 10);

    // Skip invalid ports or excluded infrastructure ports
    if (port < 1 || port > 65535 || EXCLUDED_PORTS.has(port)) continue;

    const originalUrl = match[0];
    // Deduplicate
    if (seen.has(originalUrl)) continue;
    seen.add(originalUrl);

    const path = match[2] || '/';

    results.push({
      originalUrl,
      port,
      path,
      startIndex: match.index,
      endIndex: match.index + originalUrl.length,
    });
  }

  return results;
}

/**
 * Check if a string contains any localhost URLs worth rewriting.
 */
export function hasLocalhostUrls(text: string): boolean {
  LOCALHOST_URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOCALHOST_URL_REGEX.exec(text)) !== null) {
    const port = parseInt(match[1], 10);
    if (port >= 1 && port <= 65535 && !EXCLUDED_PORTS.has(port)) {
      return true;
    }
  }
  return false;
}

/**
 * Rewrite a localhost URL to go through the sandbox proxy.
 *
 * @param port - The port number to proxy
 * @param path - The path to append (e.g. "/api/docs")
 * @param serverUrl - The active OpenCode server URL (e.g. "{BACKEND_URL}/preview/abc123/8000" or "http://localhost:4096")
 * @param mappedPorts - Optional container-port → host-port map from Docker (for local_docker multi-sandbox)
 * @returns The proxied URL
 */
export function rewriteLocalhostUrl(
  port: number,
  path: string,
  serverUrl: string,
  mappedPorts?: Record<string, string>,
): string {
  // Server URL points to the OpenCode API (:4096 or via kortix-master on :8000).
  // In cloud mode: {BACKEND_URL}/preview/{sandboxId}/8000
  // In local mode: http://localhost:4096 (but kortix-master is on :8000)

  const isCloud = serverUrl.includes('/preview/');

  if (isCloud) {
    // Cloud: {BACKEND_URL}/preview/{sandboxId}/8000/proxy/{port}{path}
    // serverUrl already points to /8000 (kortix-master)
    const base = serverUrl.replace(/\/+$/, '');
    return `${base}/proxy/${port}${path}`;
  }

  // Local mode: use kortix-master's proxy endpoint.
  // serverUrl typically already points to Kortix Master (e.g. http://localhost:14000
  // when Docker maps host 14000 → container 8000). Only override the port when:
  //   1. mappedPorts explicitly has a Kortix Master host port, OR
  //   2. serverUrl points directly to OpenCode (port 4096), not Kortix Master
  try {
    const url = new URL(serverUrl);
    if (mappedPorts?.[SANDBOX_PORTS.KORTIX_MASTER]) {
      // Multi-sandbox Docker: use the explicit host port for Kortix Master
      url.port = mappedPorts[SANDBOX_PORTS.KORTIX_MASTER];
      return `${url.origin}/proxy/${port}${path}`;
    } else if (url.port === '4096') {
      // Direct OpenCode connection (no Docker): switch to Kortix Master container port
      url.port = SANDBOX_PORTS.KORTIX_MASTER;
      return `${url.origin}/proxy/${port}${path}`;
    }
    // VPS / reverse-proxy mode: serverUrl has a path (e.g. https://host/server)
    // url.origin would strip the path, so use the full base URL instead
    const base = serverUrl.replace(/\/+$/, '');
    return `${base}/proxy/${port}${path}`;
  } catch {
    return `${serverUrl.replace(/\/+$/, '')}/proxy/${port}${path}`;
  }
}

/**
 * Build the proxy base URL for a given port (without path).
 * Used for opening preview tabs.
 */
export function getProxyBaseUrl(
  port: number,
  serverUrl: string,
  mappedPorts?: Record<string, string>,
): string {
  return rewriteLocalhostUrl(port, '/', serverUrl, mappedPorts);
}

/**
 * Check if a URL is a localhost URL that we can proxy.
 * Excludes infrastructure ports AND the current app's own port so we never
 * rewrite the frontend's own navigation links.
 */
export function isProxiableLocalhostUrl(url: string): boolean {
  const match = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})/);
  if (!match) return false;
  const port = parseInt(match[1], 10);
  if (port < 1 || port > 65535 || EXCLUDED_PORTS.has(port)) return false;

  // Never proxy URLs that point at the app itself
  if (typeof window !== 'undefined') {
    try {
      const appOrigin = window.location.origin;
      const urlOrigin = new URL(url).origin;
      if (urlOrigin === appOrigin) return false;
    } catch { /* invalid URL, fall through */ }
  }

  return true;
}

/**
 * If the given URL points to localhost:PORT, rewrite it through the sandbox
 * proxy layer. Returns the original URL unchanged when it doesn't match or
 * targets an excluded infrastructure port.
 *
 * This is the catch-all intended for use inside markdown renderers so that
 * every `<a href>`, `<img src>`, etc. that references a sandbox service
 * automatically gets proxied.
 */
export function proxyLocalhostUrl(
  url: string | undefined,
  serverUrl: string,
  mappedPorts?: Record<string, string>,
): string | undefined {
  if (!url) return url;
  // Don't rewrite URLs pointing at the app itself
  if (!isProxiableLocalhostUrl(url)) return url;
  const match = url.match(
    /^https?:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})(\/[^\s)"'<>]*)?$/,
  );
  if (!match) return url;
  const port = parseInt(match[1], 10);
  const path = match[2] || '/';
  return rewriteLocalhostUrl(port, path, serverUrl, mappedPorts);
}
