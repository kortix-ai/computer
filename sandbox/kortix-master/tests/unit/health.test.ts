import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { Hono } from 'hono'

/**
 * Tests for GET /kortix/health
 *
 * The health endpoint reads /opt/kortix/.version (a JSON file with { version })
 * and returns { status: 'ok', version }. When the file is missing or unreadable
 * it falls back to version '0.0.0'.
 *
 * Because the handler calls Bun.file() directly (a global), we create a
 * standalone Hono app per test and mock Bun.file to return controlled values.
 */

describe('GET /kortix/health', () => {
  // We'll store the original Bun.file so we can restore it
  const originalBunFile = Bun.file

  afterEach(() => {
    // Restore original Bun.file after every test
    ;(Bun as any).file = originalBunFile
  })

  /**
   * Helper: build a fresh Hono app with the health handler (same logic as index.ts).
   * We inline the handler to avoid importing index.ts which has side-effects
   * (SecretStore init, port binding, etc.).
   */
  function buildApp() {
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
      return c.json({ status: 'ok', version })
    })
    return app
  }

  it('returns { status: "ok", version } when version file is present', async () => {
    ;(Bun as any).file = (path: string) => {
      if (path === '/opt/kortix/.version') {
        return {
          exists: async () => true,
          json: async () => ({ version: '1.2.3', updatedAt: '2025-01-01' }),
        }
      }
      return originalBunFile(path)
    }

    const app = buildApp()
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', version: '1.2.3' })
  })

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

    const app = buildApp()
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', version: '0.0.0' })
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

    const app = buildApp()
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', version: '0.0.0' })
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

    const app = buildApp()
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', version: '0.0.0' })
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

    const app = buildApp()
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', version: '0.0.0' })
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

    const app = buildApp()
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

    const app = buildApp()
    const res = await app.request('/kortix/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', version: '1.0.0-beta.3' })
  })
})
