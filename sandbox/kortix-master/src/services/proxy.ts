//@ts-ignore
import type { Context } from 'hono'
import { config } from '../config'

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

  // Add OpenCode basic auth if configured
  if (config.OPENCODE_USERNAME && config.OPENCODE_PASSWORD) {
    //@ts-ignore
    const auth = Buffer.from(`${config.OPENCODE_USERNAME}:${config.OPENCODE_PASSWORD}`).toString('base64')
    headers.set('Authorization', `Basic ${auth}`)
  }

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? await c.req.raw.clone().arrayBuffer()
        : undefined,
      // @ts-ignore - Bun supports duplex
      duplex: 'half',
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
    console.error('[Kortix Master] Proxy error:', error)
    return c.json({ error: 'Failed to proxy to OpenCode', details: String(error) }, 502)
  }
}
