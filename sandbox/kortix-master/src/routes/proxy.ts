/**
 * Dynamic port proxy — /proxy/:port/*
 *
 * Pure dumb pipe: proxies requests to localhost:{port} inside the sandbox.
 * Uses decompress: false for true 1:1 byte passthrough.
 * Only touches: Host header, Location header (redirect rewriting).
 *
 * Resilience features:
 *   - Retry on transient errors (ECONNRESET, EPIPE) — handles mid-connection drops
 *   - Client disconnect propagation for SSE/streaming via AbortController
 *   - Proper error categorisation (transient vs refused vs timeout)
 */

import { Hono } from 'hono'
import { config } from '../config'

const proxyRouter = new Hono()

const BLOCKED_PORTS = new Set([config.PORT])
const FETCH_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 300

const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'authorization',
  'service-worker',
  'connection',
  'keep-alive',
  'te',
  'upgrade',
])

/**
 * Transient socket errors that may succeed on immediate retry.
 * These happen when the TCP connection is torn down mid-flight
 * (browser tab close, proxy timeout, network hiccup).
 */
const TRANSIENT_ERROR_PATTERNS = [
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ERR_STREAM_DESTROYED',
  'socket hang up',
]

function isTransientError(errMsg: string): boolean {
  return TRANSIENT_ERROR_PATTERNS.some(p => errMsg.includes(p))
}

function isConnectionRefused(errMsg: string): boolean {
  return errMsg.includes('ECONNREFUSED') || errMsg.includes('Unable to connect')
}

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

  // ── Read body once (reusable across retries) ──────────────────────────
  let body: ArrayBuffer | undefined
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    try {
      body = await c.req.raw.arrayBuffer()
    } catch {
      return c.json({ error: 'Failed to read request body' }, 400)
    }
  }

  // ── Client disconnect propagation ─────────────────────────────────────
  // For SSE and long-lived streaming responses, we need to abort the
  // upstream fetch when the downstream client disconnects. Without this,
  // zombie upstream connections accumulate until the dev server runs out
  // of file descriptors or hits a socket error.
  const clientAbort = new AbortController()
  const clientSignal = c.req.raw.signal
  if (clientSignal) {
    if (clientSignal.aborted) {
      clientAbort.abort()
    } else {
      clientSignal.addEventListener('abort', () => clientAbort.abort(), { once: true })
    }
  }

  // ── Retry loop ────────────────────────────────────────────────────────
  let lastError = ''

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Bail if the downstream client already disconnected
    if (clientAbort.signal.aborted) {
      return new Response(null, { status: 499 })
    }

    try {
      // Build per-attempt abort signal:
      //   SSE → fires on client disconnect (no timeout — streams are long-lived)
      //   Regular → fires on 30s timeout (client disconnect is less critical for short requests)
      const signal = acceptsSSE
        ? clientAbort.signal
        : AbortSignal.timeout(FETCH_TIMEOUT_MS)

      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body,
        // @ts-ignore — Bun extension: pass raw bytes, no decompression
        decompress: false,
        redirect: 'manual',
        signal,
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
      const errMsg = error instanceof Error ? error.message : String(error)
      lastError = errMsg

      // ── Client-side abort (disconnect or SSE end) ───────────────────
      if (clientAbort.signal.aborted) {
        // Client disconnected — this is normal, not an error
        return new Response(null, { status: 499 })
      }

      // ── Timeout ────────────────────────────────────────────────────
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        console.error(`[proxy] Timeout on ${c.req.method} /proxy/${port}${remainingPath} after ${FETCH_TIMEOUT_MS / 1000}s`)
        return c.json({ error: 'Upstream request timed out', port }, 504)
      }

      // ── Connection refused — server is down, no point retrying ─────
      if (isConnectionRefused(errMsg)) {
        console.error(`[proxy] Port ${port} unreachable on ${c.req.method} ${remainingPath}: nothing is listening on localhost:${port}`)
        return c.json({
          error: `Nothing listening on port ${port}`,
          port,
          details: 'Unable to connect. Is the computer able to access the url?',
        }, 502)
      }

      // ── Transient error (ECONNRESET, EPIPE, etc.) — retry ──────────
      if (isTransientError(errMsg) && attempt < MAX_RETRIES) {
        console.warn(
          `[proxy] Transient error on attempt ${attempt + 1}/${MAX_RETRIES + 1} ` +
          `for port ${port}: ${errMsg}, retrying in ${RETRY_DELAY_MS * (attempt + 1)}ms...`
        )
        await Bun.sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }

      // ── Non-retryable or final attempt ─────────────────────────────
      console.error(`[proxy] Error on ${c.req.method} /proxy/${port}${remainingPath}: ${errMsg}`)
    }
  }

  // All retries exhausted
  return c.json({
    error: 'Failed to connect to service',
    port,
    details: lastError,
  }, 502)
})

proxyRouter.all('/:port{[0-9]+}', async (c) => {
  const portStr = c.req.param('port')
  const url = new URL(c.req.url)
  return c.redirect(`/proxy/${portStr}/${url.search}`, 301)
})

export default proxyRouter
