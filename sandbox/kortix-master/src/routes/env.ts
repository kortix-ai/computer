import { Hono } from 'hono'
import { mkdir, rm } from 'fs/promises'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { SecretStore } from '../services/secret-store'

const envRouter = new Hono()
const secretStore = new SecretStore()

const S6_ENV_DIR = process.env.S6_ENV_DIR || '/run/s6/container_environment'
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || ''

// ─── Auth middleware (VPS mode only) ─────────────────────────────────────────
envRouter.use('*', async (c, next) => {
  if (!INTERNAL_SERVICE_KEY) return next()
  const auth = c.req.header('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (token !== INTERNAL_SERVICE_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
})

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

// GET /env — list all secrets (full values).
envRouter.get('/', async (c) => {
  try {
    const envVars = await secretStore.getAll()
    return c.json({ secrets: envVars })
  } catch (error) {
    console.error('[ENV API] Error listing:', error)
    return c.json({ error: 'Failed to list environment variables' }, 500)
  }
})

// POST /env — set multiple keys at once. { keys: { K: V, ... }, restart?: bool }
envRouter.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const keys = body?.keys
    const restart = body?.restart !== false
    if (!keys || typeof keys !== 'object') {
      return c.json({ error: 'Request body must contain a "keys" object' }, 400)
    }
    let updated = 0
    for (const [key, value] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      await secretStore.setEnv(key, value)
      await writeS6Env(key, value)
      updated++
    }
    if (restart) await restartServices()
    return c.json({ ok: true, updated, restarted: restart })
  } catch (error) {
    console.error('[ENV API] Error setting bulk:', error)
    return c.json({ error: 'Failed to set environment variables' }, 500)
  }
})

// GET /env/:key — get a single key (raw value).
envRouter.get('/:key', async (c) => {
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
})

// POST /env/:key — set a single key. { value: "..." }
envRouter.post('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const body = await c.req.json()
    const restart = (body?.restart === true) || c.req.query('restart') === '1'
    if (!body || typeof body.value !== 'string') {
      return c.json({ error: 'Request body must contain a "value" field' }, 400)
    }
    await secretStore.setEnv(key, body.value)
    await writeS6Env(key, body.value)
    if (restart) await restartServices()
    return c.json({ ok: true, key })
  } catch (error) {
    console.error('[ENV API] Error setting key:', error)
    return c.json({ error: 'Failed to set environment variable' }, 500)
  }
})

// PUT /env/:key — alias for POST (frontend uses PUT for set).
envRouter.put('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const body = await c.req.json()
    if (!body || typeof body.value !== 'string') {
      return c.json({ error: 'Request body must contain a "value" field' }, 400)
    }
    await secretStore.setEnv(key, body.value)
    await writeS6Env(key, body.value)
    await restartServices()
    return c.json({ ok: true, key })
  } catch (error) {
    console.error('[ENV API] Error setting key:', error)
    return c.json({ error: 'Failed to set environment variable' }, 500)
  }
})

// DELETE /env/:key — remove a key.
envRouter.delete('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    await secretStore.deleteEnv(key)
    await deleteS6Env(key)
    await restartServices()
    return c.json({ ok: true, key })
  } catch (error) {
    console.error('[ENV API] Error deleting key:', error)
    return c.json({ error: 'Failed to delete environment variable' }, 500)
  }
})

export default envRouter
