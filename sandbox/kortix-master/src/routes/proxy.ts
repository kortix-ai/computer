import { Hono } from 'hono'
import { config } from '../config'

const proxyRouter = new Hono()

// Blocked ports — prevent proxying to kortix-master itself or other sensitive services
const BLOCKED_PORTS = new Set([
  config.PORT,  // kortix-master itself (default 8000)
])

const FETCH_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Service Worker approach
//
// Instead of trying to rewrite every absolute path in HTML/JS/CSS responses
// (which is impossible to do reliably — ES module imports, dynamic imports,
// fetch() calls, WebSocket URLs, CSS url(), etc.), we inject a Service Worker
// into the initial HTML response.
//
// The Service Worker intercepts ALL requests from the page and rewrites
// absolute paths (e.g. /src/main.tsx) to go through the proxy prefix
// (e.g. /proxy/5173/src/main.tsx). This catches everything: static imports,
// dynamic imports, fetch(), img src, css url(), etc.
//
// Flow:
// 1. Browser requests /proxy/5173/
// 2. Proxy fetches from localhost:5173/, gets HTML
// 3. Proxy injects a <script> that registers a Service Worker
// 4. The SW intercepts all subsequent requests and rewrites paths
// 5. All rewrites go through /proxy/5173/... which the proxy handles normally
// ---------------------------------------------------------------------------

/**
 * Generate the Service Worker JavaScript for a given proxy prefix.
 * This SW intercepts all fetch requests from the page and rewrites
 * absolute paths to go through the proxy.
 */
function generateServiceWorkerJs(prefix: string): string {
  return `// Kortix Proxy Service Worker — rewrites all requests through ${prefix}
const PREFIX = '${prefix}';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) return;

  // Already has the proxy prefix — pass through
  if (url.pathname.startsWith(PREFIX + '/') || url.pathname === PREFIX) return;

  // Skip kortix internal paths
  if (url.pathname.startsWith('/kortix/') || url.pathname.startsWith('/env/') || url.pathname.startsWith('/lss/')) return;

  // Skip other proxy paths (different port)
  if (url.pathname.match(/^\\/proxy\\/\\d+/)) return;

  // Rewrite: /src/main.tsx → /proxy/5173/src/main.tsx
  const newUrl = new URL(PREFIX + url.pathname + url.search, url.origin);
  e.respondWith(fetch(new Request(newUrl.href, e.request)));
});
`
}

/**
 * Generate the inline bootstrap script that registers the Service Worker.
 * The SW is loaded from a special URL: /proxy/{port}/__kortix_sw__.js
 *
 * Only reloads ONCE after first SW activation. Uses sessionStorage to
 * prevent reload loops. If the SW is already controlling the page,
 * does nothing.
 */
function generateBootstrapScript(prefix: string): string {
  return `<script>
(function() {
  if (!('serviceWorker' in navigator)) return;

  // If a SW is already controlling this page, we're good — do nothing.
  if (navigator.serviceWorker.controller) return;

  var swUrl = '${prefix}/__kortix_sw__.js';
  var scope = '${prefix}/';
  var reloadKey = '__kortix_sw_reload_' + scope;

  // Prevent infinite reload: only reload once per session per scope.
  if (sessionStorage.getItem(reloadKey)) return;

  navigator.serviceWorker.register(swUrl, { scope: scope })
    .then(function(reg) {
      // SW is already active and controlling — no reload needed.
      if (reg.active && navigator.serviceWorker.controller) return;

      var sw = reg.installing || reg.waiting || reg.active;
      if (!sw) return;

      if (sw.state === 'activated') {
        // Activated but not yet controlling (first install).
        // Reload so it takes control.
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return;
      }

      sw.addEventListener('statechange', function() {
        if (sw.state === 'activated') {
          sessionStorage.setItem(reloadKey, '1');
          window.location.reload();
        }
      });
    });
})();
</script>`
}

/**
 * Inject the SW bootstrap into an HTML response.
 */
function injectBootstrap(html: string, prefix: string): string {
  const script = generateBootstrapScript(prefix)

  // Inject right after <head> (or <head ...attributes>)
  const headMatch = html.match(/<head(\s[^>]*)?>/)
  if (headMatch) {
    const pos = headMatch.index! + headMatch[0].length
    return html.slice(0, pos) + script + html.slice(pos)
  }

  // No <head>? Inject at the very top
  return script + html
}


// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Dynamic port proxy: /proxy/:port/*
 *
 * Proxies HTTP requests to any localhost port inside the sandbox container.
 * For HTML responses, injects a Service Worker bootstrap that rewrites
 * all subsequent requests through the proxy prefix.
 */
proxyRouter.all('/:port{[0-9]+}/*', async (c) => {
  const portStr = c.req.param('port')
  const port = parseInt(portStr, 10)

  if (isNaN(port) || port < 1 || port > 65535) {
    return c.json({ error: 'Invalid port number', port: portStr }, 400)
  }

  if (BLOCKED_PORTS.has(port)) {
    return c.json({ error: 'Port is blocked', port }, 403)
  }

  const url = new URL(c.req.url)
  const prefix = `/proxy/${portStr}`
  const remainingPath = url.pathname.slice(prefix.length) || '/'

  // ── Serve the Service Worker script ──────────────────────────────────
  if (remainingPath === '/__kortix_sw__.js') {
    return new Response(generateServiceWorkerJs(prefix), {
      status: 200,
      headers: {
        'content-type': 'application/javascript',
        'cache-control': 'no-cache',
        'service-worker-allowed': prefix + '/',
      },
    })
  }

  const targetUrl = `http://localhost:${port}${remainingPath}${url.search}`

  // Build headers
  const headers = new Headers()
  for (const [key, value] of c.req.raw.headers.entries()) {
    const lower = key.toLowerCase()
    if (lower === 'host' || lower === 'authorization') continue
    // Strip service-worker header so upstream doesn't see it
    if (lower === 'service-worker') continue
    headers.set(key, value)
  }
  headers.set('Host', `localhost:${port}`)

  // Detect SSE
  const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream')

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? await c.req.raw.arrayBuffer()
        : undefined,
      // @ts-ignore - Bun supports duplex
      duplex: 'half',
      redirect: 'manual',
      signal: acceptsSSE ? undefined : AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    // Rewrite Location headers for redirects
    const responseHeaders = new Headers(response.headers)
    const location = responseHeaders.get('location')
    if (location) {
      try {
        const locUrl = new URL(location, `http://localhost:${port}`)
        if (locUrl.hostname === 'localhost' && parseInt(locUrl.port || '80') === port) {
          responseHeaders.set('location', `${prefix}${locUrl.pathname}${locUrl.search}`)
        }
      } catch { /* leave as-is */ }
    }

    // Streaming responses — pass through as stream
    const contentType = responseHeaders.get('content-type') || ''
    if (contentType.includes('text/event-stream') || contentType.includes('application/octet-stream')) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    }

    // HTML responses — inject the Service Worker bootstrap
    if (contentType.includes('text/html')) {
      const html = await response.text()
      const rewritten = injectBootstrap(html, prefix)

      responseHeaders.set('content-length', String(Buffer.byteLength(rewritten, 'utf-8')))
      responseHeaders.delete('transfer-encoding')

      return new Response(rewritten, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    }

    // Everything else — buffer and forward
    const body = await response.arrayBuffer()
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return c.json({ error: 'Upstream request timed out', port, details: `Service on port ${port} did not respond within 30s` }, 504)
    }
    console.error(`[Kortix Master] Port proxy error (port ${port}): ${error instanceof Error ? error.message : String(error)}`)
    return c.json(
      {
        error: 'Failed to connect to service',
        port,
        details: String(error),
        hint: `No service appears to be running on port ${port} inside the sandbox.`,
      },
      502
    )
  }
})

// Bare /proxy/:port (no trailing slash) — redirect to /proxy/:port/
proxyRouter.all('/:port{[0-9]+}', async (c) => {
  const portStr = c.req.param('port')
  const url = new URL(c.req.url)
  return c.redirect(`/proxy/${portStr}/${url.search}`, 301)
})

export default proxyRouter
