import { timingSafeEqual, createHash } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { describeRoute, resolver, generateSpecs } from 'hono-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { buildMergedSpec } from './services/spec-merger'
import { proxyToOpenCode } from './services/proxy'
import { SecretStore } from './services/secret-store'
import { syncAuthToSecrets, startWatcher as startAuthWatcher } from './services/auth-sync'
import envRouter from './routes/env'
import lssRouter from './routes/lss'
import proxyRouter from './routes/proxy'
import updateRouter from './routes/update'
import deployRouter from './routes/deploy'
import servicesRouter from './routes/services'
import integrationsRouter from './routes/integrations'
import memoryRouter from './routes/memory'
import { config } from './config'
import { HealthResponse, PortsResponse } from './schemas/common'

// ─── Changelog ──────────────────────────────────────────────────────────────
const CHANGELOG_FILE = '/opt/kortix/CHANGELOG.json'

async function getChangelog(version: string) {
  try {
    const file = Bun.file(CHANGELOG_FILE)
    if (await file.exists()) {
      const entries = await file.json()
      return entries.find((e: any) => e.version === version) ?? null
    }
  } catch {}
  return null
}

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

// ─── Guarantee KORTIX_TOKEN + KORTIX_API_URL in s6 env dir ──────────────────
// These are injected as Docker env vars at container creation but never written
// to the s6 env directory. Tools use getEnv() which falls back to reading
// /run/s6/container_environment/{KEY} — so we must write them there on boot
// to ensure they're always available regardless of how the process was started.
{
  const S6_ENV_DIR = process.env.S6_ENV_DIR || '/run/s6/container_environment'
  const CORE_VARS = ['KORTIX_TOKEN', 'KORTIX_API_URL', 'INTERNAL_SERVICE_KEY'] as const
  let synced = 0
  for (const key of CORE_VARS) {
    const val = process.env[key]
    if (val) {
      try {
        if (!existsSync(S6_ENV_DIR)) mkdirSync(S6_ENV_DIR, { recursive: true })
        await Bun.write(`${S6_ENV_DIR}/${key}`, val)
        synced++
      } catch (err) {
        console.warn(`[Kortix Master] Failed to write ${key} to s6 env dir:`, err)
      }
    }
  }
  if (synced > 0) {
    console.log(`[Kortix Master] Synced ${synced} core env var(s) to s6 env dir`)
  }
}

// Two-way sync: OpenCode auth.json ↔ SecretStore (provider API keys)
// Boot sync: pull any keys from auth.json into SecretStore + s6 env
await syncAuthToSecrets(secretStore).catch(err =>
  console.error('[Kortix Master] auth-sync boot error:', err)
)
// File watcher: auto-sync when auth.json changes at runtime
startAuthWatcher(secretStore)

// Global middleware
app.use('*', logger())

// CORS: restrict to allowed origins. Defaults to localhost-only for security.
// CORS_ALLOWED_ORIGINS can add extra origins (comma-separated).
const defaultCorsOrigins = [
  'http://localhost:3000', 'http://127.0.0.1:3000',   // Frontend (local)
  'http://localhost:8008', 'http://127.0.0.1:8008',   // kortix-api (local)
  'http://localhost:14000', 'http://127.0.0.1:14000', // Direct sandbox (dev)
]
const extraCorsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : []
const corsOrigins = [...new Set([...defaultCorsOrigins, ...extraCorsOrigins])]
app.use('*', cors({ origin: corsOrigins }))

// ─── Timing-safe token comparison ─────────────────────────────────────────────
// Hash both values so timingSafeEqual always compares equal-length buffers,
// regardless of token length. Prevents timing side-channel attacks.
function verifyServiceKey(candidate: string): boolean {
  const expected = config.INTERNAL_SERVICE_KEY
  if (!candidate || !expected) return false
  const a = createHash('sha256').update(candidate).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// ─── Localhost detection ─────────────────────────────────────────────────────
// Requests originating from inside the container (localhost/loopback) skip auth.
// This allows tools, scripts, and curl inside the sandbox to call the master
// without needing INTERNAL_SERVICE_KEY. External callers (kortix-api, frontend
// proxy) still must provide the key.
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

function isLocalRequest(c: any): boolean {
  const addr = c.env?.remoteAddr
  return !!addr && LOOPBACK_ADDRS.has(addr)
}

// ─── Global auth ─────────────────────────────────────────────────────────────
// Protects ALL routes with bearer token or ?token= query param.
// INTERNAL_SERVICE_KEY is always present (auto-generated if not provided).
// Localhost requests (from inside the sandbox) bypass auth entirely.
app.use('*', async (c, next) => {
  // Skip health endpoint — Docker health probes need unauthenticated access
  const pathname = new URL(c.req.url).pathname
  if (pathname === '/kortix/health') return next()
  // Skip docs endpoints — API docs should be accessible without auth
  if (pathname === '/docs' || pathname === '/docs/openapi.json') return next()

  // Skip auth for requests from inside the sandbox (localhost/loopback)
  if (isLocalRequest(c)) return next()

  const authHeader = c.req.header('Authorization')
  let token: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  if (!token) {
    token = c.req.query('token') || null
  }

  if (!token || !verifyServiceKey(token)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
})

// ─── OpenCode readiness tracking ─────────────────────────────────────────────
let openCodeReady = false
let openCodeLastCheck = 0
const OPENCODE_CHECK_INTERVAL = 5_000 // recheck every 5s when not ready

async function checkOpenCodeReady(): Promise<boolean> {
  if (openCodeReady) return true
  const now = Date.now()
  if (now - openCodeLastCheck < OPENCODE_CHECK_INTERVAL) return false
  openCodeLastCheck = now
  try {
    const res = await fetch(`http://${config.OPENCODE_HOST}:${config.OPENCODE_PORT}/session`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (res.ok) {
      openCodeReady = true
      console.log('[Kortix Master] OpenCode is ready')
      // Consume body to free connection
      await res.arrayBuffer()
      return true
    }
  } catch {}
  return false
}

// Fire initial check in background
checkOpenCodeReady()

// ─── API Documentation ──────────────────────────────────────────────────────

// OpenAPI JSON spec endpoint — merges kortix-master + OpenCode specs at runtime
app.get('/docs/openapi.json',
  describeRoute({ hide: true, responses: { 200: { description: 'OpenAPI spec' } } }),
  async (c) => {
    // Generate kortix-master's own spec
    const kortixSpec = await generateSpecs(app)
    // Merge with OpenCode's spec (fetched from localhost, cached 30s)
    const merged = await buildMergedSpec(kortixSpec as any)

    // Use the X-Forwarded-Prefix header injected by the platform proxy to set
    // the correct server URL for Scalar "Try It". This header contains the full
    // public base URL (e.g. "http://localhost:8008/v1/p/kortix-sandbox/8000").
    // Without it, fall back to the placeholder from spec-merger.
    const forwardedPrefix = c.req.header('x-forwarded-prefix')
    if (forwardedPrefix) {
      return c.json({
        ...merged,
        servers: [{ url: forwardedPrefix, description: 'Current sandbox' }],
      })
    }

    return c.json(merged)
  },
)

// Scalar API Reference UI
app.get('/docs',
  describeRoute({ hide: true, responses: { 200: { description: 'API docs UI' } } }),
  Scalar({
    url: 'docs/openapi.json',
    pageTitle: 'Kortix Sandbox API',
  }),
)

// Health check — includes current sandbox version
// Returns 200 when OpenCode is reachable, 503 when it's still starting up.
// This ensures Docker/orchestrators treat the container as unhealthy until
// the core API backend (OpenCode) is ready to serve requests.
app.get('/kortix/health',
  describeRoute({
    tags: ['System'],
    summary: 'Health check',
    description: 'Returns sandbox health status, current version, active WebSocket connections, and OpenCode readiness. Returns 200 when OpenCode is reachable, 503 when still starting.',
    responses: {
      200: { description: 'Healthy — OpenCode is reachable', content: { 'application/json': { schema: resolver(HealthResponse) } } },
      503: { description: 'Starting — OpenCode is not yet reachable', content: { 'application/json': { schema: resolver(HealthResponse) } } },
    },
  }),
  async (c) => {
    let version = '0.0.0'
    try {
      const file = Bun.file('/opt/kortix/.version')
      if (await file.exists()) {
        const data = await file.json()
        version = data.version || '0.0.0'
      }
    } catch {}
    await checkOpenCodeReady()
    const changelog = await getChangelog(version)
    const status = openCodeReady ? 'ok' : 'starting'
    const httpStatus = openCodeReady ? 200 : 503
    return c.json({ status, version, changelog, activeWs: activeConnections, opencode: openCodeReady }, httpStatus)
  },
)

// Port mappings — returns container→host port map so the frontend
// can use direct URLs instead of guessing proxy paths.
app.get('/kortix/ports',
  describeRoute({
    tags: ['System'],
    summary: 'Port mappings',
    description: 'Returns the container-port to host-port mapping configured by docker-compose. Used by the frontend to build direct URLs.',
    responses: {
      200: { description: 'Port map', content: { 'application/json': { schema: resolver(PortsResponse) } } },
    },
  }),
  (c) => {
    return c.json({ ports: config.PORT_MAP })
  },
)

// Update check — /kortix/update and /kortix/update/status
app.route('/kortix/update', updateRouter)

// ENV management routes
app.route('/env', envRouter)

// LSS semantic search — /lss/search?q=<query> runs local semantic search
app.route('/lss', lssRouter)

// Deployment management
app.route('/kortix/deploy', deployRouter)

// Services — unified "what's running" for the frontend
app.route('/kortix/services', servicesRouter)

// Integration proxy — /api/integrations/* forwards to kortix-api
app.route('/api/integrations', integrationsRouter)

// Dynamic port proxy — /proxy/:port/* forwards to localhost:{port} inside the sandbox
app.route('/proxy', proxyRouter)

// File management — direct sandbox filesystem access for downloads, uploads, etc.
// Mounted BEFORE the catch-all OpenCode proxy so it works regardless of OpenCode version.
import filesRouter from './routes/files'
app.route('/file', filesRouter)

// Memory — read-only access to the OpenCode memory plugin's SQLite database
app.route('/memory', memoryRouter)

// Proxy all other requests to OpenCode
app.all('*',
  describeRoute({ hide: true, responses: { 200: { description: 'Proxied to OpenCode' } } }),
  async (c) => {
    return proxyToOpenCode(c)
  },
)

console.log(`[Kortix Master] Starting on port ${config.PORT}`)
console.log(`[Kortix Master] Proxying to OpenCode at ${config.OPENCODE_HOST}:${config.OPENCODE_PORT}`)
console.log(`[Kortix Master] API docs available at http://localhost:${config.PORT}/docs`)

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

  // Raise Bun's idle timeout from the default 10s. SSE connections
  // (e.g. /global/event) can be long-lived with no data flowing —
  // the default kills them, causing the frontend to reconnect in a loop.
  // Per-request override (server.timeout(req, 0)) is also applied for SSE
  // in the proxy, but this global value covers any other long-lived connections.
  idleTimeout: 255, // seconds; per-request SSE override disables it entirely

  fetch(req: Request, server: any): Response | Promise<Response> | undefined {
    // ── Per-request timeout for SSE ─────────────────────────────────────
    // Disable idle timeout entirely for SSE requests so Bun doesn't kill
    // long-lived event streams after the global idleTimeout.
    if ((req.headers.get('accept') || '').includes('text/event-stream')) {
      server.timeout(req, 0)
    }
    // ── WebSocket upgrade for /proxy/:port/* ────────────────────────────
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const url = new URL(req.url)

      // Skip auth for localhost (same-container) WS connections
      const wsRemoteAddr = server.requestIP(req)?.address
      const wsIsLocal = !!wsRemoteAddr && LOOPBACK_ADDRS.has(wsRemoteAddr)

      if (!wsIsLocal) {
        // Validate INTERNAL_SERVICE_KEY for external WS upgrades (header or ?token= query param)
        const authHeader = req.headers.get('Authorization')
        let wsToken: string | null = null
        if (authHeader?.startsWith('Bearer ')) wsToken = authHeader.slice(7)
        if (!wsToken) wsToken = url.searchParams.get('token')
        if (!wsToken || !verifyServiceKey(wsToken)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

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
    // Pass the client IP via env so the auth middleware can detect localhost
    const remoteAddr = server.requestIP(req)?.address
    return app.fetch(req, { remoteAddr })
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

        upstream.addEventListener('close', (e: CloseEvent) => {
          if (!ws.data.closed) {
            // Propagate close code/reason from upstream to downstream client
            try { ws.close(e.code || 1000, e.reason || '') } catch { /* already closed */ }
          }
        })

        upstream.addEventListener('error', (e: Event) => {
          // Log the actual error for debugging — WS error events don't carry
          // details, but the close that follows will have the code/reason.
          console.warn(`[Kortix Master] WS upstream error for port ${targetPort} (path: ${targetPath})`)
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
