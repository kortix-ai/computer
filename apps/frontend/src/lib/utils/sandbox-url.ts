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
    } else if (url.port === '4096') {
      // Direct OpenCode connection (no Docker): switch to Kortix Master container port
      url.port = SANDBOX_PORTS.KORTIX_MASTER;
    }
    // Otherwise, serverUrl already points to Kortix Master — keep its port as-is
    return `${url.origin}/proxy/${port}${path}`;
  } catch {
    return `${serverUrl}/proxy/${port}${path}`;
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
 */
export function isProxiableLocalhostUrl(url: string): boolean {
  const match = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d{1,5})/);
  if (!match) return false;
  const port = parseInt(match[1], 10);
  return port >= 1 && port <= 65535 && !EXCLUDED_PORTS.has(port);
}
