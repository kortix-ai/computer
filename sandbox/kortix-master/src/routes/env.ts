import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { mkdir, rm } from 'fs/promises'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { SecretStore } from '../services/secret-store'
import { syncSecretToAuth } from '../services/auth-sync'
import {
  ErrorResponse,
  UnauthorizedResponse,
  SecretsListResponse,
  SetBulkEnvBody,
  SetBulkEnvResponse,
  SetSingleEnvBody,
  SetSingleEnvResponse,
  DeleteEnvResponse,
  RotateTokenBody,
  RotateTokenResponse,
} from '../schemas/common'

const envRouter = new Hono()
const secretStore = new SecretStore()

const S6_ENV_DIR = process.env.S6_ENV_DIR || '/run/s6/container_environment'

// NOTE: Per-route auth middleware removed — global auth in index.ts now
// always enforces INTERNAL_SERVICE_KEY on all routes (auto-generated if not set).

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeS6Env(key: string, value: string): Promise<void> {
  if (!existsSync(S6_ENV_DIR)) {
    await mkdir(S6_ENV_DIR, { recursive: true })
  }
  await Bun.write(`${S6_ENV_DIR}/${key}`, value)
}

async function deleteS6Env(key: string): Promise<void> {
  try { await rm(`${S6_ENV_DIR}/${key}`) } catch {}
}

/**
 * Get the innermost PID namespace PID for a given /proc entry.
 * Returns the PID to use with process.kill() from within this namespace.
 */
function getInnerNsPid(procPid: number): number | null {
  try {
    const status = readFileSync(`/proc/${procPid}/status`, 'utf-8')
    const nspidLine = status.split('\n').find(l => l.startsWith('NSpid:'))
    if (!nspidLine) return null
    const nspids = nspidLine.split(/\s+/).slice(1).map(Number)
    const innerPid = nspids[nspids.length - 1]
    return (!isNaN(innerPid) && innerPid > 0) ? innerPid : null
  } catch {
    return null
  }
}

async function restartServices(): Promise<void> {
  // Restart OpenCode so it picks up new env vars via s6 with-contenv.
  //
  // The opencode CLI is a Node wrapper → native binary chain. s6-svc -r
  // only SIGTERMs the supervised PID and doesn't propagate to grandchildren.
  //
  // CRITICAL: This container uses `unshare --pid` creating a nested PID
  // namespace. `pgrep`/`kill`/`killall` all fail because they resolve PIDs
  // in the outer namespace but kill() operates in the inner namespace.
  // We read NSpid from /proc/{pid}/status to get the inner namespace PID.
  try {
    const killed: number[] = []

    for (const entry of readdirSync('/proc')) {
      const pid = parseInt(entry, 10)
      if (isNaN(pid) || pid <= 1) continue
      try {
        const comm = readFileSync(`/proc/${pid}/comm`, 'utf-8').trim()
        // Kill native opencode binaries (comm="opencode")
        if (comm === 'opencode') {
          const innerPid = getInnerNsPid(pid)
          if (innerPid) {
            process.kill(innerPid, 9)
            killed.push(innerPid)
          }
          continue
        }
        // Kill node wrappers (comm="node", cmdline contains opencode)
        if (comm === 'node' || comm === 'MainThread') {
          const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
          if (cmdline.includes('/usr/local/bin/opencode')) {
            const innerPid = getInnerNsPid(pid)
            if (innerPid) {
              process.kill(innerPid, 9)
              killed.push(innerPid)
            }
          }
        }
      } catch {}
    }

    console.log(`[ENV API] restart opencode: killed inner pids=${killed.join(',')}`)
    // s6 detects longrun died → auto-restarts with fresh env via with-contenv.
  } catch (e) {
    console.error(`[ENV API] restart opencode: error=${e}`)
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// NOTE: Tools use getEnv() which hot-reads from the s6 env directory (tmpfs).
// Setting a key writes the s6 env file, making it instantly available to tools
// WITHOUT restarting OpenCode. Restart is ONLY used by rotate-token (which
// changes the encryption key and requires a fresh process). Normal set/delete
// operations never restart.

// GET /env — list all secrets (full values).
envRouter.get('/',
  describeRoute({
    tags: ['Secrets'],
    summary: 'List all secrets',
    description: 'Returns all stored environment variables / secrets with their full values.',
    responses: {
      200: { description: 'Secret list', content: { 'application/json': { schema: resolver(SecretsListResponse) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const envVars = await secretStore.getAll()
      return c.json({ secrets: envVars })
    } catch (error) {
      console.error('[ENV API] Error listing:', error)
      return c.json({ error: 'Failed to list environment variables' }, 500)
    }
  },
)

// POST /env — set multiple keys at once. { keys: { K: V, ... } }
// Never restarts services — tools pick up new values via s6 env dir.
envRouter.post('/',
  describeRoute({
    tags: ['Secrets'],
    summary: 'Set multiple secrets',
    description: 'Bulk-set environment variables. Does NOT restart services — tools pick up values via s6 env dir instantly.',
    responses: {
      200: { description: 'Keys updated', content: { 'application/json': { schema: resolver(SetBulkEnvResponse) } } },
      400: { description: 'Invalid body', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const body = await c.req.json()
      const keys = body?.keys
      if (!keys || typeof keys !== 'object') {
        return c.json({ error: 'Request body must contain a "keys" object' }, 400)
      }
      let updated = 0
      for (const [key, value] of Object.entries(keys as Record<string, unknown>)) {
        if (typeof value !== 'string') continue
        await secretStore.setEnv(key, value)
        await writeS6Env(key, value)
        await syncSecretToAuth(key, value)  // sync provider keys → auth.json
        updated++
      }
      return c.json({ ok: true, updated, restarted: false })
    } catch (error) {
      console.error('[ENV API] Error setting bulk:', error)
      return c.json({ error: 'Failed to set environment variables' }, 500)
    }
  },
)

// GET /env/:key — get a single key (raw value).
envRouter.get('/:key',
  describeRoute({
    tags: ['Secrets'],
    summary: 'Get a single secret',
    description: 'Returns the value of a single secret by key. Returns 200 with null value when key does not exist.',
    responses: {
      200: { description: 'Secret value (key→value object)', content: { 'application/json': { schema: resolver(z.record(z.string(), z.string().nullable())) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const key = c.req.param('key')
      const value = await secretStore.get(key)
      // Return 200 with null value when key doesn't exist — avoids 404 retry loops
      // in the frontend (e.g. ONBOARDING_COMPLETE before first onboarding).
      return c.json({ [key]: value })
    } catch (error) {
      console.error('[ENV API] Error getting key:', error)
      return c.json({ error: 'Failed to get environment variable' }, 500)
    }
  },
)

// POST /env/rotate-token — atomically rotate KORTIX_TOKEN and re-encrypt all secrets.
// Called by the platform API after regenerating a sandbox key.
envRouter.post('/rotate-token',
  describeRoute({
    tags: ['Secrets'],
    summary: 'Rotate encryption token',
    description: 'Atomically rotates the KORTIX_TOKEN and re-encrypts all secrets with the new key. Always restarts services.',
    responses: {
      200: { description: 'Token rotated', content: { 'application/json': { schema: resolver(RotateTokenResponse) } } },
      400: { description: 'Invalid body', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const body = await c.req.json()
      const newToken = body?.token
      if (!newToken || typeof newToken !== 'string') {
        return c.json({ error: 'Request body must contain a "token" string' }, 400)
      }

      // Atomic rotation: decrypt all with old key → switch → re-encrypt with new key
      const result = await secretStore.rotateToken(newToken)

      // Write new token to s6 env dir so restarted services pick it up
      await writeS6Env('KORTIX_TOKEN', newToken)

      // Restart OpenCode to pick up the new token
      await restartServices()

      console.log(`[ENV API] Token rotated, re-encrypted ${result.rotated} secrets`)
      return c.json({ ok: true, ...result })
    } catch (error) {
      console.error('[ENV API] Token rotation error:', error)
      return c.json({ error: 'Failed to rotate token' }, 500)
    }
  },
)

// POST /env/:key — set a single key. { value: "..." }
// Never restarts services — tools pick up new values via s6 env dir.
envRouter.post('/:key',
  describeRoute({
    tags: ['Secrets'],
    summary: 'Set a single secret',
    description: 'Sets a single environment variable. Does NOT restart services — tools pick up values via s6 env dir instantly.',
    responses: {
      200: { description: 'Key set', content: { 'application/json': { schema: resolver(SetSingleEnvResponse) } } },
      400: { description: 'Invalid body', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const key = c.req.param('key')
      const body = await c.req.json()
      if (!body || typeof body.value !== 'string') {
        return c.json({ error: 'Request body must contain a "value" field' }, 400)
      }
      await secretStore.setEnv(key, body.value)
      await writeS6Env(key, body.value)
      await syncSecretToAuth(key, body.value)  // sync provider keys → auth.json
      return c.json({ ok: true, key, restarted: false })
    } catch (error) {
      console.error('[ENV API] Error setting key:', error)
      return c.json({ error: 'Failed to set environment variable' }, 500)
    }
  },
)

// PUT /env/:key — alias for POST (frontend uses PUT for set).
// Never restarts services — tools pick up new values via s6 env dir.
envRouter.put('/:key',
  describeRoute({
    tags: ['Secrets'],
    summary: 'Set a single secret (PUT)',
    description: 'Alias for POST /env/:key. Sets a single environment variable. Does NOT restart services.',
    responses: {
      200: { description: 'Key set', content: { 'application/json': { schema: resolver(SetSingleEnvResponse) } } },
      400: { description: 'Invalid body', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const key = c.req.param('key')
      const body = await c.req.json()
      if (!body || typeof body.value !== 'string') {
        return c.json({ error: 'Request body must contain a "value" field' }, 400)
      }
      await secretStore.setEnv(key, body.value)
      await writeS6Env(key, body.value)
      await syncSecretToAuth(key, body.value)  // sync provider keys → auth.json
      return c.json({ ok: true, key, restarted: false })
    } catch (error) {
      console.error('[ENV API] Error setting key:', error)
      return c.json({ error: 'Failed to set environment variable' }, 500)
    }
  },
)

// DELETE /env/:key — remove a key. Deletes from secret store and s6 env dir.
// Does NOT restart services. The s6 env file removal means getEnv() will
// fall back to process.env (stale) but new tool invocations won't see the key.
envRouter.delete('/:key',
  describeRoute({
    tags: ['Secrets'],
    summary: 'Delete a secret',
    description: 'Removes an environment variable. Does NOT restart services.',
    responses: {
      200: { description: 'Key deleted', content: { 'application/json': { schema: resolver(DeleteEnvResponse) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(UnauthorizedResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const key = c.req.param('key')
      await secretStore.deleteEnv(key)
      await deleteS6Env(key)
      await syncSecretToAuth(key, '')  // clear provider key from auth.json
      return c.json({ ok: true, key })
    } catch (error) {
      console.error('[ENV API] Error deleting key:', error)
      return c.json({ error: 'Failed to delete environment variable' }, 500)
    }
  },
)

export default envRouter

// z import needed for inline resolver usage
import { z } from 'zod'
