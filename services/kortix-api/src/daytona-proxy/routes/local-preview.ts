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
import { execSync } from 'child_process';

const KORTIX_MASTER_PORT = 8000;
const FETCH_TIMEOUT_MS = 30_000;

// ─── Service Key Sync ────────────────────────────────────────────────────────
// Ensures the running sandbox container has the same INTERNAL_SERVICE_KEY as us.
// Triggered on first 401 from the sandbox (key mismatch after startup).
// Retries up to MAX_SYNC_ATTEMPTS on failure before giving up.
const MAX_SYNC_ATTEMPTS = 3;
let _syncAttempts = 0;
let _serviceKeySynced = false;

function trySyncServiceKey(): boolean {
  if (_serviceKeySynced) return false;
  if (_syncAttempts >= MAX_SYNC_ATTEMPTS) {
    console.error(`[LOCAL-PREVIEW] INTERNAL_SERVICE_KEY sync failed after ${MAX_SYNC_ATTEMPTS} attempts, giving up`);
    return false;
  }
  _syncAttempts++;
  try {
    const ourKey = config.INTERNAL_SERVICE_KEY;
    if (!ourKey) return false;

    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
      env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
    }

    console.log(`[LOCAL-PREVIEW] Syncing INTERNAL_SERVICE_KEY to sandbox container (attempt ${_syncAttempts}/${MAX_SYNC_ATTEMPTS})...`);
    execSync(
      `docker exec kortix-sandbox bash -c "mkdir -p /run/s6/container_environment && ` +
      `printf '%s' '${ourKey}' > /run/s6/container_environment/INTERNAL_SERVICE_KEY && ` +
      `sudo s6-svc -r /run/service/svc-kortix-master"`,
      { timeout: 15_000, stdio: 'pipe', env },
    );
    _serviceKeySynced = true;
    console.log('[LOCAL-PREVIEW] INTERNAL_SERVICE_KEY synced, waiting for restart...');
    // Give kortix-master a moment to restart
    execSync('sleep 2', { stdio: 'pipe' });
    return true;
  } catch (err: any) {
    console.error(`[LOCAL-PREVIEW] Failed to sync INTERNAL_SERVICE_KEY (attempt ${_syncAttempts}/${MAX_SYNC_ATTEMPTS}):`, err.message || err);
    // Don't set _serviceKeySynced — allow retry on next 401
    return false;
  }
}

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

  // On 401 from sandbox: service key mismatch. Sync our key and retry once.
  if (response.status === 401 && !_serviceKeySynced) {
    const synced = trySyncServiceKey();
    if (synced) {
      // Retry the request with the same key (now the sandbox should accept it)
      const retryResponse = await fetch(targetUrl, {
        method,
        headers,
        body: incomingBody,
        signal: acceptsSSE ? undefined : AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // @ts-ignore
        decompress: false,
        redirect: 'manual',
      });
      const retryHeaders = new Headers(retryResponse.headers);
      if (origin) {
        retryHeaders.set('Access-Control-Allow-Origin', origin);
        retryHeaders.set('Access-Control-Allow-Credentials', 'true');
      }
      return new Response(retryResponse.body, {
        status: retryResponse.status,
        statusText: retryResponse.statusText,
        headers: retryHeaders,
      });
    }
  }

  // Log upstream 5xx errors so they're visible (not silently proxied through)
  if (response.status >= 500 && !acceptsSSE) {
    // Clone the response to peek at the body without consuming it
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      const snippet = text.slice(0, 300);
      // Try JSON first
      try {
        const parsed = JSON.parse(snippet);
        const errMsg = parsed?.data?.message || parsed?.message || parsed?.error || snippet.slice(0, 150);
        console.error(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port}): ${errMsg}`);
      } catch {
        if (snippet.includes('__bunfallback') || snippet.includes('BunError')) {
          console.error(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port}): Bun crash/module error (check sandbox logs)`);
        } else {
          console.error(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port}): ${snippet || '(empty)'}`);
        }
      }
    } catch {
      console.error(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port})`);
    }
  }

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


