import { Hono } from 'hono'
import { config } from '../config'

const proxyRouter = new Hono()

// Blocked ports — prevent proxying to kortix-master itself or other sensitive services
const BLOCKED_PORTS = new Set([
  config.PORT,  // kortix-master itself (default 8000)
])

/**
 * Dynamic port proxy: /proxy/:port/*
 *
 * Proxies HTTP requests to any localhost port inside the sandbox container.
 * This enables the frontend to access any service the agent starts
 * (e.g. dev servers on port 3000, 8080, 5173, etc.) without needing
 * those ports individually exposed in docker-compose.
 *
 * In cloud mode, the frontend accesses this via:
 *   https://kortix.cloud/{sandboxId}/8000/proxy/{port}/{path}
 *
 * In local mode:
 *   http://localhost:8000/proxy/{port}/{path}
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

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? await c.req.raw.clone().arrayBuffer()
        : undefined,
      // @ts-ignore - Bun supports duplex
      duplex: 'half',
      redirect: 'manual',
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

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
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
