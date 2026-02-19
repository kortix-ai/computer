/**
 * Sandbox Proxy — catch-all route that forwards requests to the local sandbox
 * (Kortix Master). This eliminates the frontend's need to know the sandbox URL
 * directly; everything goes through the backend.
 *
 * Routes: /v1/sandbox/* → http://localhost:{SANDBOX_PORT_BASE}/*
 *
 * Handles:
 *   - Normal HTTP requests (JSON APIs, file upload, etc.)
 *   - SSE streams (Accept: text/event-stream) — streamed without buffering
 *   - WebSocket upgrades are handled at the Bun server level (see index.ts)
 *
 * In cloud mode, the existing /v1/preview/:sandboxId/:port/* handles this role.
 * This proxy is for local/VPS mode where the frontend talks to a single sandbox.
 */

import { Hono } from 'hono';
import { config } from '../config';

// 30s timeout for regular HTTP requests
const FETCH_TIMEOUT_MS = 30_000;

const sandboxProxyApp = new Hono();

/**
 * Resolve the sandbox's Kortix Master URL.
 * In local Docker mode: http://localhost:{SANDBOX_PORT_BASE} (default 14000)
 * In Docker network:    http://sandbox:8000 (if on same Docker network)
 *
 * For now we use localhost + SANDBOX_PORT_BASE which matches the Docker
 * port mapping (host 14000 → container 8000).
 */
function getSandboxBaseUrl(): string {
  // Check if running inside Docker (same network as sandbox)
  // If SANDBOX_INTERNAL_URL is set, use it (e.g. http://sandbox:8000)
  const internalUrl = process.env.SANDBOX_INTERNAL_URL;
  if (internalUrl) return internalUrl.replace(/\/+$/, '');

  return `http://localhost:${config.SANDBOX_PORT_BASE}`;
}

/**
 * Catch-all: proxy any request under /v1/sandbox/* to the sandbox.
 * The /v1/sandbox prefix is stripped — e.g.:
 *   GET /v1/sandbox/session → GET http://localhost:14000/session
 *   GET /v1/sandbox/event   → GET http://localhost:14000/event (SSE)
 *   POST /v1/sandbox/session/:id/message → POST http://localhost:14000/session/:id/message
 */
sandboxProxyApp.all('/*', async (c) => {
  // Build the target URL by stripping the mount prefix (/v1/sandbox)
  const url = new URL(c.req.url);
  // c.req.path gives the FULL URL path (e.g. /v1/sandbox/session).
  // We need to strip the mount prefix to get just /session.
  const fullPath = url.pathname;
  const mountPrefix = '/v1/sandbox';
  const targetPath = fullPath.startsWith(mountPrefix)
    ? fullPath.slice(mountPrefix.length) || '/'
    : fullPath;
  const sandboxBaseUrl = getSandboxBaseUrl();
  const targetUrl = `${sandboxBaseUrl}${targetPath}${url.search}`;

  // Build headers, forwarding most but not Host
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }

  // Detect SSE requests (Accept: text/event-stream)
  const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream');

  // Abort controller linked to client disconnect
  const controller = new AbortController();
  const { signal } = controller;

  if (acceptsSSE) {
    // SSE: link to client's request signal for proper cleanup
    const clientSignal = c.req.raw.signal;
    if (clientSignal) {
      if (clientSignal.aborted) {
        controller.abort();
      } else {
        clientSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
  } else {
    // Regular request: 30s timeout
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  }

  try {
    // Read the request body as ArrayBuffer first, then forward it.
    // Passing c.req.raw.body (ReadableStream) directly to fetch() can cause
    // Bun to send an empty body for small payloads — reading first is safer.
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

    // SSE or streaming response — pass body through as a stream (no buffering)
    const contentType = response.headers.get('content-type') || '';
    if (
      contentType.includes('text/event-stream') ||
      contentType.includes('application/octet-stream')
    ) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // Regular response — buffer to avoid Bun ReadableStream proxy issues
    const responseBody = await response.arrayBuffer();
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    // Handle abort/timeout
    if (
      error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      if (!acceptsSSE) {
        return c.json(
          {
            error: 'Sandbox not responding',
            details: `${targetPath} timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
          },
          504,
        );
      }
      // SSE client disconnected
      return new Response(null, { status: 499 });
    }

    console.error(
      `[sandbox-proxy] Error for ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json(
      { error: 'Failed to proxy to sandbox', details: String(error) },
      502,
    );
  }
});

export { sandboxProxyApp, getSandboxBaseUrl };
