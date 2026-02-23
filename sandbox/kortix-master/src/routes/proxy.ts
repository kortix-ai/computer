/**
 * Dynamic port proxy — /proxy/:port/*
 *
 * Pure dumb pipe: proxies requests to localhost:{port} inside the sandbox.
 * Uses decompress: false for true 1:1 byte passthrough.
 * Only touches: Host header, Location header (redirect rewriting).
 */

import { Hono } from 'hono'
import { config } from '../config'

const proxyRouter = new Hono()

const BLOCKED_PORTS = new Set([config.PORT])
const FETCH_TIMEOUT_MS = 30_000

const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'authorization',
  'service-worker',
  'connection',
  'keep-alive',
  'te',
  'upgrade',
])

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
  const targetUrl = `http://localhost:${port}${remainingPath}${url.search}`

  const headers = new Headers()
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) continue
    headers.set(key, value)
  }
  headers.set('Host', `localhost:${port}`)

  const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream')

  try {
    const body = (c.req.method !== 'GET' && c.req.method !== 'HEAD')
      ? await c.req.raw.arrayBuffer()
      : undefined

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body,
      // @ts-ignore — Bun extension: pass raw bytes, no decompression
      decompress: false,
      redirect: 'manual',
      signal: acceptsSSE ? undefined : AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    const responseHeaders = new Headers(response.headers)

    // Rewrite Location header for redirects
    const location = responseHeaders.get('location')
    if (location) {
      try {
        const locUrl = new URL(location, `http://localhost:${port}`)
        if (locUrl.hostname === 'localhost' && parseInt(locUrl.port || '80') === port) {
          responseHeaders.set('location', `${prefix}${locUrl.pathname}${locUrl.search}`)
        }
      } catch { /* leave as-is */ }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return c.json({ error: 'Upstream request timed out', port }, 504)
    }
    console.error(`[proxy] Error (port ${port}): ${error instanceof Error ? error.message : String(error)}`)
    return c.json({ error: 'Failed to connect to service', port, details: String(error) }, 502)
  }
})

proxyRouter.all('/:port{[0-9]+}', async (c) => {
  const portStr = c.req.param('port')
  const url = new URL(c.req.url)
  return c.redirect(`/proxy/${portStr}/${url.search}`, 301)
})

export default proxyRouter
