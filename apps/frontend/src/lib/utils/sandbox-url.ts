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

export interface ParsedLocalhostUrl {
  /** Canonicalized localhost URL (http(s)://localhost:PORT/path?query#hash) */
  originalUrl: string;
  /** Parsed port number */
  port: number;
  /** Parsed path + query + hash (always starts with /) */
  path: string;
}

/**
 * Regex to detect localhost URLs in text.
 * Matches: http://localhost:PORT, http://127.0.0.1:PORT, https://localhost:PORT
 * Captures optional path, query string, and fragment.
 * Does NOT match bare localhost without a port (too ambiguous).
 */
const LOCALHOST_URL_REGEX =
  /https?:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}[^\s)"'<>]*/g;

/**
 * Ports that should NOT be rewritten — they're already exposed/handled natively
 * by the sandbox infrastructure (VNC, OpenCode Web, presentation viewer, etc.)
 */
const EXCLUDED_PORTS = new Set([
  parseInt(SANDBOX_PORTS.OPENCODE_UI, 10),  // Frontend UI (port 3111)
  4096,  // OpenCode API (proxied by Kortix Master)
  parseInt(SANDBOX_PORTS.KORTIX_MASTER, 10),  // Kortix Master itself
]);

/**
 * Check if a URL path indicates the URL has already been proxied.
 * Prevents double-proxy issues like localhost:14000/proxy/14000/proxy/3210/...
 */
function isAlreadyProxied(path: string): boolean {
  return /^\/proxy\/\d+/.test(path);
}

function normalizePath(path: string): string {
  if (!path) return '/';

  let normalized = path;

  // Guard against markdown-link artifacts leaking into URL paths.
  const markdownBoundary = normalized.indexOf('](');
  if (markdownBoundary !== -1) {
    normalized = normalized.slice(0, markdownBoundary);
  }

  // Same guard after browser-encoding (`]` -> `%5D`).
  const encodedBoundary = normalized.toLowerCase().indexOf('%5d(');
  if (encodedBoundary !== -1) {
    normalized = normalized.slice(0, encodedBoundary);
  }

  if (!normalized) return '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

/**
 * Markdown/plain-text extraction can include trailing markdown syntax when the
 * link label is itself a URL, e.g.:
 *   [http://localhost:3210/viewer.html](http://localhost:3210/viewer.html)
 * For the label URL token, regex extraction sees `...viewer.html](http://...`.
 * Trim that markdown boundary before URL parsing.
 */
function stripMarkdownArtifacts(url: string): string {
  const markerIndex = url.indexOf('](');
  if (markerIndex === -1) return url;
  return url.slice(0, markerIndex);
}

/**
 * Parse a localhost URL in one place so all consumers share identical rules.
 */
export function parseLocalhostUrl(rawUrl: string | undefined): ParsedLocalhostUrl | null {
  if (!rawUrl) return null;

  const candidate = stripMarkdownArtifacts(rawUrl.trim());

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
    if (!parsed.port) return null;

    const port = parseInt(parsed.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

    const path = normalizePath(`${parsed.pathname || '/'}${parsed.search}${parsed.hash}`);

    return {
      originalUrl: `${parsed.protocol}//${parsed.hostname}:${port}${path}`,
      port,
      path,
    };
  } catch {
    return null;
  }
}

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
    const parsed = parseLocalhostUrl(match[0]);
    if (!parsed) continue;

    const { originalUrl, port, path } = parsed;

    // Skip invalid ports or excluded infrastructure ports
    if (port < 1 || port > 65535 || EXCLUDED_PORTS.has(port)) continue;
    // Deduplicate
    if (seen.has(originalUrl)) continue;
    seen.add(originalUrl);

    // Skip URLs that are already proxied (e.g. http://localhost:14000/proxy/3210/...)
    // to prevent double-proxy chains
    if (isAlreadyProxied(path)) continue;

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
  return detectLocalhostUrls(text).length > 0;
}

function resolveProxyBase(
  serverUrl: string,
  mappedPorts?: Record<string, string>,
): string {
  const base = serverUrl.replace(/\/+$/, '');

  // Cloud/daytona URLs are already routed through preview base paths.
  if (base.includes('/preview/')) return base;

  try {
    const parsed = new URL(base);
    const mappedMasterPort = mappedPorts?.[SANDBOX_PORTS.KORTIX_MASTER];

    if (mappedMasterPort) {
      parsed.port = mappedMasterPort;
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    }

    // Direct OpenCode API URL -> switch to Kortix Master port.
    if (parsed.port === '4096') {
      parsed.port = SANDBOX_PORTS.KORTIX_MASTER;
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    }

    // VPS/reverse-proxy path prefixes should be preserved as-is.
    return base;
  } catch {
    return base;
  }
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
  const safePath = normalizePath(path);
  const proxyBase = resolveProxyBase(serverUrl, mappedPorts);
  return `${proxyBase}/proxy/${port}${safePath}`;
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
 * Also excludes URLs that are already proxied (path starts with /proxy/).
 */
export function isProxiableLocalhostUrl(url: string): boolean {
  const parsed = parseLocalhostUrl(url);
  if (!parsed) return false;

  if (EXCLUDED_PORTS.has(parsed.port)) return false;

  // Skip URLs whose path already contains /proxy/ (already rewritten)
  if (isAlreadyProxied(parsed.path)) return false;

  // Never proxy URLs that point at the app itself
  if (typeof window !== 'undefined') {
    try {
      const appOrigin = window.location.origin;
      const urlOrigin = new URL(parsed.originalUrl).origin;
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

  const parsed = parseLocalhostUrl(url);
  if (!parsed) return url;

  // Don't rewrite URLs pointing at the app itself or already-proxied URLs
  if (!isProxiableLocalhostUrl(parsed.originalUrl)) return parsed.originalUrl;

  return rewriteLocalhostUrl(parsed.port, parsed.path, serverUrl, mappedPorts);
}

/**
 * Build the internal (container-side) localhost URL for a given port + path.
 * This is what the user sees as the "real" address inside the sandbox.
 *
 * @example toInternalUrl(8080, '/api/docs') → 'http://localhost:8080/api/docs'
 */
export function toInternalUrl(port: number, path: string = '/'): string {
  return `http://localhost:${port}${path}`;
}

/**
 * Try to reverse-map a proxy URL back to its internal localhost equivalent.
 *
 * Handles patterns like:
 *   - `http://host:PORT/proxy/{containerPort}{path}` → `http://localhost:{containerPort}{path}`
 *   - `{BACKEND_URL}/preview/{sandboxId}/{containerPort}{path}` → `http://localhost:{containerPort}{path}`
 *   - Direct mapped port URLs (e.g. `http://localhost:14002/...`) → `http://localhost:6080/...`
 *
 * Returns null if the URL can't be reverse-mapped.
 */
export function proxyUrlToInternal(
  proxyUrl: string,
  mappedPorts?: Record<string, string>,
): string | null {
  try {
    const url = new URL(proxyUrl);

    // Pattern 1: /proxy/{containerPort}/... (the most common case)
    const proxyMatch = url.pathname.match(/^\/proxy\/(\d+)(\/.*)?$/);
    if (proxyMatch) {
      const containerPort = proxyMatch[1];
      const path = proxyMatch[2] || '/';
      return `http://localhost:${containerPort}${path}`;
    }

    // Pattern 2: /preview/{sandboxId}/{containerPort}/... (cloud mode)
    const previewMatch = url.pathname.match(/^\/(?:v1\/)?preview\/[^/]+\/(\d+)(\/.*)?$/);
    if (previewMatch) {
      const containerPort = previewMatch[1];
      const path = previewMatch[2] || '/';
      return `http://localhost:${containerPort}${path}`;
    }

    // Pattern 3: Direct mapped port URL (e.g. http://localhost:14002/path)
    // Reverse-lookup: find which container port maps to this host port
    if (mappedPorts) {
      const hostPort = url.port;
      for (const [containerPort, mappedHostPort] of Object.entries(mappedPorts)) {
        if (mappedHostPort === hostPort) {
          return `http://localhost:${containerPort}${url.pathname}${url.search}`;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
