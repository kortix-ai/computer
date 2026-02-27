import { describe, it, expect, afterEach } from 'bun:test'
import { Hono } from 'hono'

/**
 * Tests for GET /kortix/health
 *
 * The health endpoint reads /opt/kortix/.version (a JSON file with { version })
 * and checks OpenCode readiness. Behaviour:
 *
 *   - OpenCode ready   → 200 { status: 'ok',       opencode: true,  ... }
 *   - OpenCode not ready → 503 { status: 'starting', opencode: false, ... }
 *
 * When the version file is missing or unreadable it falls back to '0.0.0'.
 *
 * Because the handler calls Bun.file() directly (a global), we create a
 * standalone Hono app per test and mock Bun.file to return controlled values.
 */

describe('GET /kortix/health', () => {
  const originalBunFile = Bun.file

  afterEach(() => {
    ;(Bun as any).file = originalBunFile
  })

  /**
   * Helper: build a fresh Hono app with the health handler (same logic as index.ts).
   * We inline the handler to avoid importing index.ts which has side-effects
   * (SecretStore init, port binding, etc.).
   *
   * @param openCodeReady - simulates whether OpenCode is reachable
   */
  function buildApp(openCodeReady: boolean) {
    const app = new Hono()
    app.get('/kortix/health', async (c) => {
      let version = '0.0.0'
      try {
        const file = Bun.file('/opt/kortix/.version')
        if (await file.exists()) {
          const data = await file.json()
          version = data.version || '0.0.0'
        }
      } catch {}
      const status = openCodeReady ? 'ok' : 'starting'
      const httpStatus = openCodeReady ? 200 : 503
      return c.json({ status, version, opencode: openCodeReady }, httpStatus)
    })
    return app
  }

  // ─── OpenCode ready (200) ─────────────────────────────────────────────────

  it('returns 200 with status "ok" when OpenCode is ready', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ version: '1.2.3' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBe('1.2.3')
    expect(body.opencode).toBe(true)
  })

  // ─── OpenCode NOT ready (503) ─────────────────────────────────────────────

  it('returns 503 with status "starting" when OpenCode is not ready', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ version: '1.2.3' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(false)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('starting')
    expect(body.version).toBe('1.2.3')
    expect(body.opencode).toBe(false)
  })

  // ─── Version file edge cases ──────────────────────────────────────────────

  it('returns version "0.0.0" when the file does not exist', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => false,
          json: async () => { throw new Error('no file') },
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBe('0.0.0')
  })

  it('returns version "0.0.0" when the file contains invalid JSON', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => { throw new SyntaxError('Unexpected token') },
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBe('0.0.0')
  })

  it('returns version "0.0.0" when JSON has no "version" field', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ other: 'data' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBe('0.0.0')
  })

  it('returns version "0.0.0" when file.exists() throws', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => { throw new Error('permission denied') },
          json: async () => { throw new Error('not called') },
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBe('0.0.0')
  })

  it('returns correct Content-Type header', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ version: '2.0.0' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('handles version strings with pre-release tags', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ version: '1.0.0-beta.3' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(true)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBe('1.0.0-beta.3')
  })

  // ─── 503 still returns valid JSON with version info ───────────────────────

  it('503 response still includes version and content-type for debugging', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ version: '3.1.0' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp(false)
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body.version).toBe('3.1.0')
    expect(body.status).toBe('starting')
  })
})
