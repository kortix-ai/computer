/**
 * Local Preview Proxy — handles /preview/{sandboxId}/{port}/* requests in local mode.
 *
 * This is the local-mode counterpart of the Daytona preview proxy.
 * Instead of going through Daytona SDK, it proxies directly to the sandbox
 * container on the Docker network using the sandbox ID as the Docker DNS name.
 *
 * URL pattern:
 *   /v1/preview/{sandboxId}/{port}/*
 *
 * Routing:
 *   - Port 8000 (Kortix Master): proxy to http://{sandboxId}:8000/{path}
 *   - Other ports: proxy to http://{sandboxId}:8000/proxy/{port}/{path}
 *     (Kortix Master's built-in port proxy)
 *
 * The sandboxId is the Docker container name (e.g. 'kortix-sandbox'),
 * which resolves via Docker DNS on the shared network.
 *
 * Handles HTTP, SSE (text/event-stream), and regular responses.
 * WebSocket upgrades are handled at the Bun server level (see index.ts).
 */

import { Hono } from 'hono';
import { config } from '../../config';
import { sandboxAuthStore } from '../../platform/sandbox-auth-store';

const KORTIX_MASTER_PORT = 8000;
const FETCH_TIMEOUT_MS = 30_000;

const localPreview = new Hono();

/**
 * Resolve the sandbox's Kortix Master URL from its container name.
 * Inside Docker: http://{sandboxId}:8000 (Docker DNS resolves the container name)
 * On host (pnpm dev): http://localhost:{SANDBOX_PORT_BASE} (fixed port mapping)
 */
export function getSandboxBaseUrl(sandboxId: string): string {
  if (config.DOCKER_HOST) {
    return `http://${sandboxId}:8000`;
  }
  return `http://localhost:${config.SANDBOX_PORT_BASE}`;
}

// Match any sandboxId — the conditional mount in daytona-proxy/index.ts ensures
// this handler is only active in local mode.
localPreview.all('/:sandboxId/:port/*', async (c) => {
  const sandboxId = c.req.param('sandboxId');
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    return c.json({ error: `Invalid port: ${portStr}` }, 400);
  }

  // Build remaining path after /{sandboxId}/{port}
  const fullPath = new URL(c.req.url).pathname;
  const prefixPattern = `/${sandboxId}/${portStr}`;
  const prefixIndex = fullPath.indexOf(prefixPattern);
  const remainingPath = prefixIndex !== -1
    ? fullPath.slice(prefixIndex + prefixPattern.length) || '/'
    : '/';
  const queryString = new URL(c.req.url).search;

  // Build target URL
  const sandboxBaseUrl = getSandboxBaseUrl(sandboxId);
  let targetUrl: string;

  if (port === KORTIX_MASTER_PORT) {
    // Direct to Kortix Master root
    targetUrl = `${sandboxBaseUrl}${remainingPath}${queryString}`;
  } else {
    // Through Kortix Master's port proxy: /proxy/{port}/{path}
    targetUrl = `${sandboxBaseUrl}/proxy/${port}${remainingPath}${queryString}`;
  }

  // Forward headers (strip Host, replace Authorization with service key)
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    const lower = key.toLowerCase();
    // Strip Host (proxied separately) and Authorization (replaced with service key)
    if (lower === 'host' || lower === 'authorization') continue;
    headers.set(key, value);
  }

  // Inject internal service key for sandbox-side auth (if configured).
  // The user's SANDBOX_AUTH_TOKEN was already validated by the middleware;
  // now we forward the INTERNAL_SERVICE_KEY so the sandbox trusts the proxy.
  const serviceKey = await sandboxAuthStore.getServiceKey();
  if (serviceKey) {
    headers.set('Authorization', `Bearer ${serviceKey}`);
  }

  // SSE detection for proper timeout/streaming handling
  const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream');

  // Abort controller: SSE links to client disconnect, HTTP has 30s timeout
  const controller = new AbortController();
  const { signal } = controller;

  if (acceptsSSE) {
    const clientSignal = c.req.raw.signal;
    if (clientSignal) {
      if (clientSignal.aborted) {
        controller.abort();
      } else {
        clientSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
  } else {
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  }

  try {
    // Read body as ArrayBuffer (Bun drops ReadableStream bodies on small payloads)
    let body: ArrayBuffer | undefined;
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      body = await c.req.raw.arrayBuffer();
    }

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body,
      signal,
    });

    // Inject CORS headers
    const respHeaders = new Headers(response.headers);
    const origin = c.req.header('Origin') || '';
    if (origin) {
      respHeaders.set('Access-Control-Allow-Origin', origin);
      respHeaders.set('Access-Control-Allow-Credentials', 'true');
    }

    // SSE/streaming: pass body through without buffering
    const contentType = response.headers.get('content-type') || '';
    if (
      contentType.includes('text/event-stream') ||
      contentType.includes('application/octet-stream')
    ) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
    }

    // Regular response: buffer to avoid Bun ReadableStream issues
    const responseBody = await response.arrayBuffer();
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      if (!acceptsSSE) {
        return c.json(
          {
            error: 'Sandbox not responding',
            details: `${remainingPath} timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
          },
          504,
        );
      }
      return new Response(null, { status: 499 });
    }

    console.error(
      `[local-preview] Error for ${sandboxId}:${port}${remainingPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json(
      { error: 'Failed to proxy to sandbox', details: String(error) },
      502,
    );
  }
});

// Handle /{sandboxId}/:port without trailing path — redirect to /{sandboxId}/:port/
localPreview.all('/:sandboxId/:port', async (c) => {
  const sandboxId = c.req.param('sandboxId');
  const port = c.req.param('port');
  const url = new URL(c.req.url);
  return c.redirect(`/${sandboxId}/${port}/${url.search}`, 301);
});

export { localPreview };
