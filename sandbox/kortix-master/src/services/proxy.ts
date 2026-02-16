//@ts-ignore
import type { Context } from 'hono'
import { config } from '../config'

// 30s timeout for regular requests, 0 (none) for SSE streams
const FETCH_TIMEOUT_MS = 30_000

export async function proxyToOpenCode(c: Context): Promise<Response> {
  const url = new URL(c.req.url)
  const targetUrl = `http://${config.OPENCODE_HOST}:${config.OPENCODE_PORT}${url.pathname}${url.search}`

  // Build headers, forwarding most but not Host
  const headers = new Headers()
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value)
    }
  }

  // Detect if this is likely an SSE request (Accept: text/event-stream)
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
      // No timeout for SSE streams; 30s for regular requests
      signal: acceptsSSE ? undefined : AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    // Check if this is an SSE/streaming response — pass body as stream
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream') || contentType.includes('application/octet-stream')) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    // Buffer the response body to avoid Bun ReadableStream proxy issues
    const body = await response.arrayBuffer()
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error) {
    // Don't log abort errors (expected on timeout)
    if (error instanceof DOMException && error.name === 'AbortError') {
      return c.json({ error: 'Upstream request timed out', details: 'OpenCode did not respond within 30s' }, 504)
    }
    console.error('[Kortix Master] Proxy error:', error)
    return c.json({ error: 'Failed to proxy to OpenCode', details: String(error) }, 502)
  }
}
