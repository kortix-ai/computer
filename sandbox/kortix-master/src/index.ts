import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxyToOpenCode } from './services/proxy'
import { SecretStore } from './services/secret-store'
import envRouter from './routes/env'
import lssRouter from './routes/lss'
import proxyRouter from './routes/proxy'
import updateRouter from './routes/update'
import deployRouter from './routes/deploy'
import { config } from './config'

// ─── Crash protection ────────────────────────────────────────────────────────
// Prevent unhandled errors from silently killing the process or leaving it
// in a broken state. Log and continue.
process.on('uncaughtException', (err) => {
  console.error('[Kortix Master] UNCAUGHT EXCEPTION:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Kortix Master] UNHANDLED REJECTION:', reason)
})

const app = new Hono()

// Initialize secret store and load ENV variables
const secretStore = new SecretStore()
await secretStore.loadIntoProcessEnv()

// Global middleware
app.use('*', logger())
app.use('*', cors())

// Health check — includes current sandbox version
app.get('/kortix/health', async (c) => {
  let version = '0.0.0'
  try {
    const file = Bun.file('/opt/kortix/.version')
    if (await file.exists()) {
      const data = await file.json()
      version = data.version || '0.0.0'
    }
  } catch {}
  return c.json({ status: 'ok', version, build: '0.4.11', activeWs: activeConnections })
})

// Port mappings — returns container→host port map so the frontend
// can use direct URLs instead of guessing proxy paths.
app.get('/kortix/ports', (c) => {
  return c.json({ ports: config.PORT_MAP })
})

// Update check — /kortix/update and /kortix/update/status
app.route('/kortix/update', updateRouter)

// ENV management routes
app.route('/env', envRouter)

// LSS semantic search — /lss/search?q=<query> runs local semantic search
app.route('/lss', lssRouter)

// Deployment management
app.route('/kortix/deploy', deployRouter)

// Dynamic port proxy — /proxy/:port/* forwards to localhost:{port} inside the sandbox
app.route('/proxy', proxyRouter)

// Proxy all other requests to OpenCode
app.all('*', async (c) => {
  return proxyToOpenCode(c)
})

console.log(`[Kortix Master] Starting on port ${config.PORT}`)
console.log(`[Kortix Master] Proxying to OpenCode at ${config.OPENCODE_HOST}:${config.OPENCODE_PORT}`)

// ─── Blocked ports (same list as the HTTP proxy router) ──────────────────────
const WS_BLOCKED_PORTS = new Set([config.PORT])

// ─── Connection tracking ─────────────────────────────────────────────────────
let activeConnections = 0

// ─── WebSocket constants ─────────────────────────────────────────────────────
const WS_CONNECT_TIMEOUT_MS = 10_000      // 10s to establish upstream connection
const WS_BUFFER_MAX_BYTES = 1024 * 1024   // 1MB max buffer per connection
const WS_IDLE_TIMEOUT_MS = 5 * 60_000     // 5min idle timeout (no messages)

// ─── WebSocket data attached to each proxied connection ──────────────────────
interface WsProxyData {
  targetPort: number
  targetPath: string
  upstream: WebSocket | null
  buffered: (string | Buffer | ArrayBuffer)[]
  bufferBytes: number
  connectTimer: ReturnType<typeof setTimeout> | null
  idleTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
}

function clearWsTimers(data: WsProxyData) {
  if (data.connectTimer) { clearTimeout(data.connectTimer); data.connectTimer = null }
  if (data.idleTimer) { clearTimeout(data.idleTimer); data.idleTimer = null }
}

function resetIdleTimer(ws: { data: WsProxyData; close: (code?: number, reason?: string) => void }) {
  if (ws.data.idleTimer) clearTimeout(ws.data.idleTimer)
  ws.data.idleTimer = setTimeout(() => {
    console.warn(`[Kortix Master] WS idle timeout for port ${ws.data.targetPort}`)
    try { ws.close(1000, 'idle timeout') } catch {}
  }, WS_IDLE_TIMEOUT_MS)
}

/**
 * Parse /proxy/:port/* from a URL pathname.
 * Returns { port, path } or null if the path doesn't match.
 */
function parseProxyPath(pathname: string): { port: number; path: string } | null {
  const match = pathname.match(/^\/proxy\/(\d{1,5})(\/.*)?$/)
  if (!match) return null
  const port = parseInt(match[1], 10)
  if (isNaN(port) || port < 1 || port > 65535) return null
  return { port, path: match[2] || '/' }
}

/**
 * Bun server export — handles both HTTP (via Hono) and WebSocket upgrades.
 */
export default {
  port: config.PORT,

  fetch(req: Request, server: any): Response | Promise<Response> | undefined {
    // ── WebSocket upgrade for /proxy/:port/* ────────────────────────────
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const url = new URL(req.url)
      const parsed = parseProxyPath(url.pathname)

      if (parsed && !WS_BLOCKED_PORTS.has(parsed.port)) {
        const success = server.upgrade(req, {
          data: {
            targetPort: parsed.port,
            targetPath: parsed.path + url.search,
            upstream: null,
            buffered: [],
            bufferBytes: 0,
            connectTimer: null,
            idleTimer: null,
            closed: false,
          } satisfies WsProxyData,
        })
        if (success) return undefined // Bun took over — no HTTP response needed
      }

      // Also handle catch-all WebSocket proxy to OpenCode
      if (!parsed) {
        const success = server.upgrade(req, {
          data: {
            targetPort: config.OPENCODE_PORT,
            targetPath: url.pathname + url.search,
            upstream: null,
            buffered: [],
            bufferBytes: 0,
            connectTimer: null,
            idleTimer: null,
            closed: false,
          } satisfies WsProxyData,
        })
        if (success) return undefined
      }
    }

    // ── HTTP / SSE — delegate to Hono ──────────────────────────────────
    return app.fetch(req)
  },

  websocket: {
    /**
     * Client connected — open an upstream WebSocket to the target service.
     */
    open(ws: { data: WsProxyData; send: (data: any) => void; close: (code?: number, reason?: string) => void }) {
      activeConnections++
      const { targetPort, targetPath } = ws.data
      const upstreamUrl = `ws://localhost:${targetPort}${targetPath}`

      // Start idle timer
      resetIdleTimer(ws)

      // Connection timeout — if upstream doesn't connect in time, kill it
      ws.data.connectTimer = setTimeout(() => {
        if (ws.data.upstream?.readyState === WebSocket.CONNECTING) {
          console.warn(`[Kortix Master] WS upstream connect timeout for port ${targetPort}`)
          try { ws.data.upstream.close() } catch {}
          try { ws.close(1011, 'upstream connect timeout') } catch {}
        }
      }, WS_CONNECT_TIMEOUT_MS)

      try {
        const upstream = new WebSocket(upstreamUrl)
        ws.data.upstream = upstream

        upstream.addEventListener('open', () => {
          // Clear connect timeout
          if (ws.data.connectTimer) { clearTimeout(ws.data.connectTimer); ws.data.connectTimer = null }

          // Flush any messages buffered while upstream was connecting
          for (const msg of ws.data.buffered) {
            upstream.send(msg)
          }
          ws.data.buffered = []
          ws.data.bufferBytes = 0
        })

        upstream.addEventListener('message', (e: MessageEvent) => {
          resetIdleTimer(ws)
          try { ws.send(e.data) } catch {
            // Client disconnected — close upstream
            try { upstream.close() } catch {}
          }
        })

        upstream.addEventListener('close', () => {
          if (!ws.data.closed) {
            try { ws.close() } catch { /* already closed */ }
          }
        })

        upstream.addEventListener('error', () => {
          if (!ws.data.closed) {
            try { ws.close(1011, 'upstream error') } catch { /* already closed */ }
          }
        })
      } catch (err) {
        console.error(`[Kortix Master] WS proxy failed to connect to port ${targetPort}:`, err)
        try { ws.close(1011, 'upstream connection failed') } catch {}
      }
    },

    /**
     * Client sent a message — forward to upstream.
     */
    message(ws: { data: WsProxyData; close: (code?: number, reason?: string) => void }, message: string | Buffer) {
      resetIdleTimer(ws)
      const upstream = ws.data.upstream
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(message)
      } else if (upstream && upstream.readyState === WebSocket.CONNECTING) {
        // Buffer until upstream is ready, with size limit
        const size = typeof message === 'string' ? message.length : (message as Buffer).byteLength
        if (ws.data.bufferBytes + size > WS_BUFFER_MAX_BYTES) {
          console.warn(`[Kortix Master] WS buffer overflow for port ${ws.data.targetPort}, closing`)
          try { ws.close(1011, 'buffer overflow') } catch {}
          return
        }
        ws.data.buffered.push(message)
        ws.data.bufferBytes += size
      }
      // If upstream is closed/closing, silently drop
    },

    /**
     * Client disconnected — tear down upstream and all timers.
     */
    close(ws: { data: WsProxyData }) {
      activeConnections--
      ws.data.closed = true
      clearWsTimers(ws.data)
      try { ws.data.upstream?.close() } catch {}
      ws.data.upstream = null
      ws.data.buffered = []
      ws.data.bufferBytes = 0
    },
  },
}
