import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { SecretStore } from '../../src/services/secret-store'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Tests for the ENV API routes (/env).
 *
 * The production env router (src/routes/env.ts) creates a SecretStore singleton
 * at module level, which reads paths from process.env at construction time.
 * To avoid module-caching issues and ensure each test gets a clean SecretStore,
 * we build a test router that mirrors the real one but uses a fresh SecretStore
 * instance pointing to temp directories.
 *
 * This tests the same route logic without depending on module load order.
 */

function buildEnvApp(secretStore: SecretStore): Hono {
  const app = new Hono()

  // Mirror the routes from src/routes/env.ts exactly
  app.get('/env', async (c) => {
    try {
      const envVars = await secretStore.getAll()
      return c.json(envVars)
    } catch (error) {
      console.error('[ENV API] Error listing environment variables:', error)
      return c.json({ error: 'Failed to list environment variables' }, 500)
    }
  })

  app.get('/env/:key', async (c) => {
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

  app.post('/env/:key', async (c) => {
    try {
      const key = c.req.param('key')
      const body = await c.req.json()

      if (!body || typeof body.value !== 'string') {
        return c.json({ error: 'Request body must contain a "value" field with string value' }, 400)
      }

      await secretStore.setEnv(key, body.value)
      return c.json({ message: 'Environment variable set', key, value: body.value })
    } catch (error) {
      console.error('[ENV API] Error setting environment variable:', error)
      return c.json({ error: 'Failed to set environment variable' }, 500)
    }
  })

  app.delete('/env/:key', async (c) => {
    try {
      const key = c.req.param('key')
      await secretStore.deleteEnv(key)
      return c.json({ message: 'Environment variable deleted', key })
    } catch (error) {
      console.error('[ENV API] Error deleting environment variable:', error)
      return c.json({ error: 'Failed to delete environment variable' }, 500)
    }
  })

  return app
}

describe('ENV API Routes', () => {
  let app: Hono
  let tempDir: string

  // Saved originals
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'env-routes-test-'))

    // Save and override environment so SecretStore uses temp paths
    savedEnv.SECRET_FILE_PATH = process.env.SECRET_FILE_PATH
    savedEnv.SALT_FILE_PATH = process.env.SALT_FILE_PATH
    savedEnv.KORTIX_TOKEN = process.env.KORTIX_TOKEN

    process.env.SECRET_FILE_PATH = join(tempDir, '.secrets.json')
    process.env.SALT_FILE_PATH = join(tempDir, '.salt')
    process.env.KORTIX_TOKEN = 'test-token-env-routes'

    // Build a fresh app with a new SecretStore (reads current process.env)
    const secretStore = new SecretStore()
    app = buildEnvApp(secretStore)
  })

  afterEach(() => {
    // Restore original environment
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }

    // Clean up temp files
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}

    // Clean up test env vars that routes may have set via setEnv
    const testKeys = [
      'TEST_API_KEY', 'TEST_SECRET', 'TEST_KEY', 'KEY1', 'KEY2',
      'DELETE_TEST', 'NEVER_SET', 'SPECIAL_KEY', 'UNICODE_KEY', 'EMPTY_KEY',
    ]
    for (const k of testKeys) delete process.env[k]
  })

  // ─── POST /env/:key ──────────────────────────────────────────────────

  describe('POST /env/:key', () => {
    it('sets an environment variable and returns confirmation', async () => {
      const res = await app.request('/env/TEST_API_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'test-api-key-123' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        message: 'Environment variable set',
        key: 'TEST_API_KEY',
        value: 'test-api-key-123',
      })

      // Should be in process.env
      expect(process.env.TEST_API_KEY).toBe('test-api-key-123')
    })

    it('returns 400 when value field is missing', async () => {
      const res = await app.request('/env/TEST_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notValue: 'test' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('value')
    })

    it('returns 400 when value is not a string', async () => {
      const res = await app.request('/env/TEST_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 123 }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('string')
    })

    it('returns 400 when body is empty object', async () => {
      const res = await app.request('/env/TEST_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })

    it('overwrites an existing variable', async () => {
      await app.request('/env/TEST_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'original' }),
      })
      expect(process.env.TEST_KEY).toBe('original')

      const res = await app.request('/env/TEST_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'updated' }),
      })
      expect(res.status).toBe(200)

      // Verify via GET
      const getRes = await app.request('/env/TEST_KEY')
      const body = await getRes.json()
      expect(body.TEST_KEY).toBe('updated')

      expect(process.env.TEST_KEY).toBe('updated')
    })
  })

  // ─── GET /env/:key ────────────────────────────────────────────────────

  describe('GET /env/:key', () => {
    it('retrieves a previously set variable', async () => {
      // Set first
      await app.request('/env/TEST_SECRET', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'secret-value' }),
      })

      const res = await app.request('/env/TEST_SECRET')
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toEqual({ TEST_SECRET: 'secret-value' })
    })

    it('returns 404 for a non-existent key', async () => {
      const res = await app.request('/env/NON_EXISTENT_KEY')
      expect(res.status).toBe(404)

      const body = await res.json()
      expect(body.error).toBe('Environment variable not found')
    })
  })

  // ─── GET /env ─────────────────────────────────────────────────────────

  describe('GET /env', () => {
    it('returns empty object when no vars are set', async () => {
      const res = await app.request('/env')
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toEqual({})
    })

    it('returns all environment variables', async () => {
      await app.request('/env/KEY1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'value1' }),
      })
      await app.request('/env/KEY2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'value2' }),
      })

      const res = await app.request('/env')
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toEqual({ KEY1: 'value1', KEY2: 'value2' })
    })
  })

  // ─── DELETE /env/:key ─────────────────────────────────────────────────

  describe('DELETE /env/:key', () => {
    it('removes a variable and clears process.env', async () => {
      // Set it first
      await app.request('/env/DELETE_TEST', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'to-be-deleted' }),
      })
      expect(process.env.DELETE_TEST).toBe('to-be-deleted')

      // Delete it
      const res = await app.request('/env/DELETE_TEST', { method: 'DELETE' })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toEqual({
        message: 'Environment variable deleted',
        key: 'DELETE_TEST',
      })

      // process.env should be cleared
      expect(process.env.DELETE_TEST).toBeUndefined()

      // Subsequent GET should 404
      const getRes = await app.request('/env/DELETE_TEST')
      expect(getRes.status).toBe(404)
    })

    it('succeeds even if the key does not exist', async () => {
      const res = await app.request('/env/NEVER_SET', { method: 'DELETE' })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.key).toBe('NEVER_SET')
    })
  })

  // ─── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles special characters in values', async () => {
      const special = 'p@$$w0rd!#&*()'
      const res = await app.request('/env/SPECIAL_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: special }),
      })
      expect(res.status).toBe(200)

      const getRes = await app.request('/env/SPECIAL_KEY')
      const body = await getRes.json()
      expect(body.SPECIAL_KEY).toBe(special)
    })

    it('handles Unicode / emoji values', async () => {
      const emoji = '🔑🚀'
      const res = await app.request('/env/UNICODE_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: emoji }),
      })
      expect(res.status).toBe(200)

      const getRes = await app.request('/env/UNICODE_KEY')
      const body = await getRes.json()
      expect(body.UNICODE_KEY).toBe(emoji)
    })

    it('handles empty string values', async () => {
      const res = await app.request('/env/EMPTY_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      })
      expect(res.status).toBe(200)
      expect(process.env.EMPTY_KEY).toBe('')

      const getRes = await app.request('/env/EMPTY_KEY')
      const body = await getRes.json()
      expect(body.EMPTY_KEY).toBe('')
    })

    it('returns JSON content-type on all responses', async () => {
      const res = await app.request('/env')
      expect(res.headers.get('content-type')).toContain('application/json')

      const res404 = await app.request('/env/MISSING')
      expect(res404.headers.get('content-type')).toContain('application/json')
    })

    it('handles a full lifecycle: set, get, update, list, delete', async () => {
      // Set
      const setRes = await app.request('/env/LIFECYCLE_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'v1' }),
      })
      expect(setRes.status).toBe(200)

      // Get
      let getRes = await app.request('/env/LIFECYCLE_KEY')
      expect((await getRes.json()).LIFECYCLE_KEY).toBe('v1')

      // Update
      await app.request('/env/LIFECYCLE_KEY', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'v2' }),
      })

      // List
      const listRes = await app.request('/env')
      const all = await listRes.json()
      expect(all.LIFECYCLE_KEY).toBe('v2')

      // Delete
      const delRes = await app.request('/env/LIFECYCLE_KEY', { method: 'DELETE' })
      expect(delRes.status).toBe(200)

      // Confirm gone
      getRes = await app.request('/env/LIFECYCLE_KEY')
      expect(getRes.status).toBe(404)

      // Clean up
      delete process.env.LIFECYCLE_KEY
    })
  })
})
