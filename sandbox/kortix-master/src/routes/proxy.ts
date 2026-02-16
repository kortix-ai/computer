import { Hono } from 'hono'
import { config } from '../config'

const proxyRouter = new Hono()

// Blocked ports — prevent proxying to kortix-master itself or other sensitive services
const BLOCKED_PORTS = new Set([
  config.PORT,  // kortix-master itself (default 8000)
])

const FETCH_TIMEOUT_MS = 30_000

/**
 * Dynamic port proxy: /proxy/:port/*
 *
 * Proxies HTTP requests to any localhost port inside the sandbox container.
 * This enables the frontend to access any service the agent starts
 * (e.g. dev servers on port 3000, 8080, 5173, etc.) without needing
 * those ports individually exposed in docker-compose.
 */
proxyRouter.all('/:port{[0-9]+}/*', async (c) => {
  const portStr = c.req.param('port')
  const port = parseInt(portStr, 10)

  // Validate port
  if (isNaN(port) || port < 1 || port > 65535) {
    return c.json({ error: 'Invalid port number', port: portStr }, 400)
  }

  if (BLOCKED_PORTS.has(port)) {
    return c.json({ error: 'Port is blocked', port }, 403)
  }

  // Extract the path after /proxy/:port/
  const url = new URL(c.req.url)
  const prefix = `/proxy/${portStr}`
  const remainingPath = url.pathname.slice(prefix.length) || '/'
  const targetUrl = `http://localhost:${port}${remainingPath}${url.search}`

  // Build headers, stripping Host (it would be wrong for the upstream)
  const headers = new Headers()
  for (const [key, value] of c.req.raw.headers.entries()) {
    const lower = key.toLowerCase()
    if (lower === 'host' || lower === 'authorization') continue
    headers.set(key, value)
  }

  // Set correct Host for the upstream service
  headers.set('Host', `localhost:${port}`)

  // Detect SSE requests
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

    // Rewrite Location headers so redirects go through the proxy too
    const responseHeaders = new Headers(response.headers)
    const location = responseHeaders.get('location')
    if (location) {
      try {
        const locUrl = new URL(location, `http://localhost:${port}`)
        // Only rewrite if the redirect target is the same localhost port
        if (locUrl.hostname === 'localhost' && parseInt(locUrl.port || '80') === port) {
          responseHeaders.set('location', `${prefix}${locUrl.pathname}${locUrl.search}`)
        }
      } catch {
        // Leave location as-is if we can't parse it
      }
    }

    // Check if this is a streaming response — pass body as stream
    const contentType = responseHeaders.get('content-type') || ''
    if (contentType.includes('text/event-stream') || contentType.includes('application/octet-stream')) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    }

    // Buffer the response body to avoid Bun ReadableStream proxy issues
    const body = await response.arrayBuffer()
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return c.json({ error: 'Upstream request timed out', port, details: `Service on port ${port} did not respond within 30s` }, 504)
    }
    console.error(`[Kortix Master] Port proxy error (port ${port}):`, error)
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

// Handle bare /proxy/:port (no trailing path) — redirect to /proxy/:port/
proxyRouter.all('/:port{[0-9]+}', async (c) => {
  const portStr = c.req.param('port')
  const url = new URL(c.req.url)
  return c.redirect(`/proxy/${portStr}/${url.search}`, 301)
})

export default proxyRouter
