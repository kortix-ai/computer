import { Hono } from 'hono'
import { mkdir, rm } from 'fs/promises'
import { SecretStore } from '../services/secret-store'

const envRouter = new Hono()
const secretStore = new SecretStore()

const S6_ENV_DIR = process.env.S6_ENV_DIR || '/run/s6/container_environment'
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || ''

// ─── Internal service auth middleware ────────────────────────────────────────
// When INTERNAL_SERVICE_KEY is set (VPS mode), require it as a Bearer token.
// When not set (local mode), allow all requests (backwards compatible).
envRouter.use('*', async (c, next) => {
  if (!INTERNAL_SERVICE_KEY) return next()

  const auth = c.req.header('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

  if (token !== INTERNAL_SERVICE_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
})

async function ensureS6EnvDir(): Promise<void> {
  await mkdir(S6_ENV_DIR, { recursive: true, mode: 0o700 })
}

async function writeS6Env(key: string, value: string): Promise<void> {
  await ensureS6EnvDir()
  await Bun.write(`${S6_ENV_DIR}/${key}`, value)
}

async function deleteS6Env(key: string): Promise<void> {
  try {
    await rm(`${S6_ENV_DIR}/${key}`)
  } catch {}
}

async function run(cmd: string): Promise<{ ok: boolean; output: string }> {
  try {
    const proc = Bun.spawn(['bash', '-c', cmd], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: '/workspace' },
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    return { ok: exitCode === 0, output: (stdout + '\n' + stderr).trim() }
  } catch (e) {
    return { ok: false, output: String(e) }
  }
}

async function restartService(name: string): Promise<void> {
  // s6-overlay v3: supervise control pipe is root-owned, so sudo is required.
  // Services live under /run/service/{name} in the LinuxServer webtop base.
  const result = await run(`sudo s6-svc -r /run/service/${name}`)
  console.log(`[ENV API] restartService(${name}): ok=${result.ok} ${result.output}`)
}

// GET /env - list all ENV vars
envRouter.get('/', async (c) => {
  try {
    const envVars = await secretStore.getAll()
    return c.json(envVars)
  } catch (error) {
    console.error('[ENV API] Error listing environment variables:', error)
    return c.json({ error: 'Failed to list environment variables' }, 500)
  }
})

// POST /env - set multiple ENV vars in one request
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

    if (restart) {
      await restartService('svc-opencode-serve')
      await restartService('svc-opencode-web')
    }

    return c.json({ ok: true, updated, restarted: restart })
  } catch (error) {
    console.error('[ENV API] Error setting environment variables:', error)
    return c.json({ error: 'Failed to set environment variables' }, 500)
  }
})

// GET /env/:key - get specific ENV var
envRouter.get('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const value = await secretStore.get(key)
    if (value === null) {
      return c.json({ error: 'Environment variable not found' }, 404)
    }
    return c.json({ [key]: value })
  } catch (error) {
    console.error('[ENV API] Error getting environment variable:', error)
    return c.json({ error: 'Failed to get environment variable' }, 500)
  }
})

// POST /env/:key - set ENV var
envRouter.post('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const body = await c.req.json()
    const restart = (body?.restart === true) || c.req.query('restart') === '1'
    
    if (!body || typeof body.value !== 'string') {
      return c.json({ error: 'Request body must contain a "value" field with string value' }, 400)
    }

    await secretStore.setEnv(key, body.value)
    await writeS6Env(key, body.value)
    console.log(`[ENV API] Set environment variable: ${key}`)

    if (restart) {
      await restartService('svc-opencode-serve')
      await restartService('svc-opencode-web')
    }
    return c.json({ message: 'Environment variable set', key, value: body.value })
  } catch (error) {
    console.error('[ENV API] Error setting environment variable:', error)
    return c.json({ error: 'Failed to set environment variable' }, 500)
  }
})

// DELETE /env/:key - delete ENV var
envRouter.delete('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const restart = c.req.query('restart') === '1'
    await secretStore.deleteEnv(key)
    await deleteS6Env(key)
    console.log(`[ENV API] Deleted environment variable: ${key}`)

    if (restart) {
      await restartService('svc-opencode-serve')
      await restartService('svc-opencode-web')
    }
    return c.json({ message: 'Environment variable deleted', key })
  } catch (error) {
    console.error('[ENV API] Error deleting environment variable:', error)
    return c.json({ error: 'Failed to delete environment variable' }, 500)
  }
})

export default envRouter
