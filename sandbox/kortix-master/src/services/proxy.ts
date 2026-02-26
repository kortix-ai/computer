//@ts-ignore
import type { Context } from 'hono'
import { config } from '../config'

// 30s timeout for regular requests
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

  // For SSE: use an AbortController linked to the client request's signal
  // so when the client disconnects, we abort the upstream fetch too.
  // For regular requests: use a 30s timeout.
  const controller = new AbortController()
  const { signal } = controller

  if (acceptsSSE) {
    // If the client request has a signal (Bun provides this when client disconnects),
    // propagate its abort to our controller
    const clientSignal = c.req.raw.signal
    if (clientSignal) {
      if (clientSignal.aborted) {
        controller.abort()
      } else {
        clientSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }
  } else {
    // Regular request: 30s timeout
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  }

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? await c.req.raw.arrayBuffer()
        : undefined,
      // @ts-ignore - Bun supports duplex
      duplex: 'half',
      signal,
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

    // Log upstream errors so they're visible in the container logs
    if (response.status >= 500) {
      try {
        const text = new TextDecoder().decode(body).slice(0, 500)
        // Try to extract a meaningful error message from JSON response
        const parsed = JSON.parse(text)
        const errMsg = parsed?.data?.message || parsed?.message || parsed?.error || text.slice(0, 200)
        console.error(`[Kortix Master] OpenCode ${response.status} on ${c.req.method} ${url.pathname}: ${errMsg}`)
      } catch {
        const text = new TextDecoder().decode(body).slice(0, 200)
        // Check for Bun's HTML error fallback (module resolution errors, etc.)
        if (text.includes('__bunfallback')) {
          // Extract the base64 error from Bun's fallback page
          const b64Match = new TextDecoder().decode(body).match(/type="binary\/peechy">\s*([\w+/=]+)\s*</)
          if (b64Match) {
            console.error(`[Kortix Master] OpenCode ${response.status} on ${c.req.method} ${url.pathname}: Bun startup crash (module resolution or compile error — check OpenCode logs)`)
          } else {
            console.error(`[Kortix Master] OpenCode ${response.status} on ${c.req.method} ${url.pathname}: Bun error page returned (check OpenCode logs)`)
          }
        } else {
          console.error(`[Kortix Master] OpenCode ${response.status} on ${c.req.method} ${url.pathname}: ${text || '(empty response)'}`)
        }
      }
    }

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error) {
    // Handle abort/timeout errors cleanly (Bun throws TimeoutError for AbortSignal.timeout,
    // AbortError for manual controller.abort())
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      if (!acceptsSSE) {
        console.error(`[Kortix Master] OpenCode timeout on ${c.req.method} ${url.pathname} after ${FETCH_TIMEOUT_MS / 1000}s`)
        return c.json({ error: 'OpenCode not responding', details: `${url.pathname} timed out after ${FETCH_TIMEOUT_MS / 1000}s — OpenCode may still be starting` }, 504)
      }
      // SSE client disconnected — just return empty response (connection is already gone)
      return new Response(null, { status: 499 })
    }
    const errMsg = error instanceof Error ? error.message : String(error)
    const isConnRefused = errMsg.includes('ECONNREFUSED') || errMsg.includes('Unable to connect')
    if (isConnRefused) {
      console.error(`[Kortix Master] OpenCode unreachable on ${c.req.method} ${url.pathname}: ${errMsg} — is OpenCode running on ${config.OPENCODE_HOST}:${config.OPENCODE_PORT}?`)
    } else {
      console.error(`[Kortix Master] Proxy error on ${c.req.method} ${url.pathname}: ${errMsg}`)
    }
    return c.json({ error: 'Failed to proxy to OpenCode', details: errMsg }, 502)
  }
}
