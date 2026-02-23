/**
 * Sandbox URL detection and rewriting utilities.
 *
 * Detects localhost URLs in agent output (e.g. "Website is live at http://localhost:8080")
 * and rewrites them to be accessible through the proxy layer.
 *
 * All modes route through the backend's unified preview proxy:
 *   {BACKEND_URL}/preview/{sandboxId}/8000/proxy/{port}/
 * The sandboxId is the container name (local) or Daytona ID (cloud).
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
  /** Whether the URL was found inside a markdown code block or inline code span */
  inCodeBlock: boolean;
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
 * Uses a non-anchored regex because the server URL may add a prefix before
 * /proxy/ (e.g. /v1/preview/kortix-sandbox/8000/proxy/3210/).
 */
function isAlreadyProxied(path: string): boolean {
  return /\/proxy\/\d+/.test(path);
}

/**
 * Extract port and remaining path from an already-proxied localhost URL.
 * e.g. "http://localhost:8008/v1/preview/.../proxy/3210/foo" → { port: 3210, path: "/foo", proxyUrl: "..." }
 * Returns null if the URL is not a localhost URL or doesn't contain a /proxy/ segment.
 */
export function parseProxiedUrl(url: string): { port: number; path: string; proxyUrl: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
    const match = parsed.pathname.match(/\/proxy\/(\d+)(\/.*)?$/);
    if (!match) return null;
    const port = parseInt(match[1], 10);
    const path = match[2] || '/';
    return { port, path, proxyUrl: url };
  } catch {
    return null;
  }
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
 * Build a sorted array of [start, end] ranges covering all fenced code blocks
 * (```...```) and inline code spans (`...`) in the markdown text.
 * Used to exclude URLs that appear inside code from generating preview cards.
 */
function getCodeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  // Fenced code blocks: ```...``` (may have language specifier on opening line)
  const fencedRegex = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = fencedRegex.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // Inline code spans: `...` (but not inside already-found fenced blocks)
  const inlineRegex = /`[^`\n]+`/g;
  while ((m = inlineRegex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    // Only add if not already inside a fenced block range
    const insideFenced = ranges.some(([rs, re]) => start >= rs && end <= re);
    if (!insideFenced) {
      ranges.push([start, end]);
    }
  }

  return ranges;
}

/**
 * Check if an index falls inside any of the given ranges.
 */
function isInsideCodeBlock(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Detect all localhost URLs in a text string.
 * Tags each result with `inCodeBlock` so consumers can render URLs found
 * inside markdown code blocks / inline code differently (e.g. compact chips
 * instead of full preview cards with iframes).
 */
export function detectLocalhostUrls(text: string): DetectedLocalhostUrl[] {
  const results: DetectedLocalhostUrl[] = [];
  const seen = new Set<string>();
  const codeRanges = getCodeRanges(text);

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
      inCodeBlock: isInsideCodeBlock(match.index, codeRanges),
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

/**
 * Rewrite a localhost URL to go through the sandbox proxy.
 *
 * The serverUrl always routes through the backend's unified preview proxy:
 *   {BACKEND_URL}/preview/{sandboxId}/8000
 * Exposes Kortix Master's /proxy/{port}/ endpoint for dynamic port proxying.
 *
 * @param port - The port number to proxy
 * @param path - The path to append (e.g. "/api/docs")
 * @param serverUrl - The active server URL (always routed through backend)
 * @returns The proxied URL
 */
export function rewriteLocalhostUrl(
  port: number,
  path: string,
  serverUrl: string,
): string {
  const safePath = normalizePath(path);
  const base = serverUrl.replace(/\/+$/, '');
  return `${base}/proxy/${port}${safePath}`;
}

/**
 * Build the proxy base URL for a given port (without path).
 * Used for opening preview tabs.
 */
export function getProxyBaseUrl(
  port: number,
  serverUrl: string,
): string {
  return rewriteLocalhostUrl(port, '/', serverUrl);
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
  _mappedPorts?: Record<string, string>,
): string | undefined {
  if (!url) return url;

  const parsed = parseLocalhostUrl(url);
  if (!parsed) return url;

  // Don't rewrite URLs pointing at the app itself or already-proxied URLs
  if (!isProxiableLocalhostUrl(parsed.originalUrl)) return parsed.originalUrl;

  return rewriteLocalhostUrl(parsed.port, parsed.path, serverUrl);
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
