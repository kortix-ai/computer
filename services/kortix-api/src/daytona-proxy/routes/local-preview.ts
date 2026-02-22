/**
 * Local Preview Proxy — dumb pipe to Kortix Master inside the sandbox.
 *
 * TRUE TRANSPARENT PROXY:
 *   - decompress: false — raw bytes pass through untouched
 *   - Response body streamed 1:1 (never buffered)
 *   - Only touches: Host, Authorization (service key), CORS
 *
 * Called from index.ts subdomain handler for subdomain-based routing:
 *   http://p{port}-{sandboxId}.localhost:{backendPort}/
 *
 * WebSocket upgrades are handled at the Bun server level (see index.ts).
 */

import { config } from '../../config';

const KORTIX_MASTER_PORT = 8000;
const FETCH_TIMEOUT_MS = 30_000;

const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'authorization',
  'connection',
  'keep-alive',
  'te',
  'upgrade',
]);

/**
 * Resolve the sandbox's Kortix Master URL.
 * Inside Docker: http://{sandboxId}:8000 (Docker DNS)
 * On host (pnpm dev): http://localhost:{SANDBOX_PORT_BASE}
 */
export function getSandboxBaseUrl(sandboxId: string): string {
  if (config.SANDBOX_NETWORK) {
    return `http://${sandboxId}:8000`;
  }
  return `http://localhost:${config.SANDBOX_PORT_BASE}`;
}

/**
 * Core proxy function — used by both Hono route handler and subdomain handler.
 * Exported so index.ts can call it directly for subdomain routing.
 */
export async function proxyToSandbox(
  sandboxId: string,
  port: number,
  method: string,
  path: string,
  queryString: string,
  incomingHeaders: Headers,
  incomingBody: ArrayBuffer | undefined,
  acceptsSSE: boolean,
  origin: string,
): Promise<Response> {
  const sandboxBaseUrl = getSandboxBaseUrl(sandboxId);
  const targetUrl = port === KORTIX_MASTER_PORT
    ? `${sandboxBaseUrl}${path}${queryString}`
    : `${sandboxBaseUrl}/proxy/${port}${path}${queryString}`;

  // Forward headers transparently
  const headers = new Headers();
  for (const [key, value] of incomingHeaders.entries()) {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set('Host', new URL(sandboxBaseUrl).host);
  if (config.INTERNAL_SERVICE_KEY) {
    headers.set('Authorization', `Bearer ${config.INTERNAL_SERVICE_KEY}`);
  }

  // Abort handling
  const controller = new AbortController();
  if (!acceptsSSE) {
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: incomingBody,
    signal: acceptsSSE ? undefined : controller.signal,
    // @ts-ignore — Bun extension: no decompression, raw byte passthrough
    decompress: false,
    redirect: 'manual',
  });

  // Stream response 1:1, only add CORS + fix redirects
  const respHeaders = new Headers(response.headers);
  if (origin) {
    respHeaders.set('Access-Control-Allow-Origin', origin);
    respHeaders.set('Access-Control-Allow-Credentials', 'true');
  }

  // Fix Location header for redirects.
  // Kortix Master's proxy rewrites e.g. http://localhost:5173/path → /proxy/5173/path.
  // For subdomain routing (p5173-sandbox.localhost:8008), the client already "is" at
  // the right port — strip the /proxy/{port} prefix so the redirect is just /path.
  // For path-based routing (OpenCode API at port 8000), there's no /proxy/ prefix, so
  // this is a no-op.
  const location = respHeaders.get('location');
  if (location && port !== KORTIX_MASTER_PORT) {
    const proxyPrefix = `/proxy/${port}`;
    if (location.startsWith(proxyPrefix)) {
      respHeaders.set('location', location.slice(proxyPrefix.length) || '/');
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  });
}


