import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import proxyRouter from '../../src/routes/proxy'
import { config } from '../../src/config'

/**
 * Tests for the proxy route (/proxy/:port/*).
 *
 * The proxy router forwards requests to localhost:{port}/{path}.
 * We mock the global `fetch` to intercept outgoing proxy requests and
 * verify correct target URL construction, header forwarding, and error handling.
 */

describe('Proxy Routes (/proxy)', () => {
  let app: Hono
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    app = new Hono()
    app.route('/proxy', proxyRouter)
  })

  afterEach(() => {
    // Restore original fetch after every test
    globalThis.fetch = originalFetch
  })

  // ─── Successful proxy ────────────────────────────────────────────────

  describe('successful proxying', () => {
    it('GET /proxy/3000/path proxies to localhost:3000/path', async () => {
      let capturedUrl = ''
      let capturedMethod = ''

      globalThis.fetch = (async (input: any, init: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString()
        capturedMethod = init?.method || 'GET'
        return new Response(JSON.stringify({ hello: 'world' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/path')

      expect(res.status).toBe(200)
      expect(capturedUrl).toBe('http://localhost:3000/path')
      expect(capturedMethod).toBe('GET')

      const body = await res.json()
      expect(body).toEqual({ hello: 'world' })
    })

    it('preserves query parameters', async () => {
      let capturedUrl = ''

      globalThis.fetch = (async (input: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString()
        return new Response('ok')
      }) as typeof fetch

      await app.request('/proxy/5173/api/data?key=value&foo=bar')

      expect(capturedUrl).toBe('http://localhost:5173/api/data?key=value&foo=bar')
    })

    it('proxies POST requests with body', async () => {
      let capturedMethod = ''
      let capturedBody: any = null

      globalThis.fetch = (async (input: any, init: any) => {
        capturedMethod = init?.method || 'GET'
        if (init?.body) {
          capturedBody = new TextDecoder().decode(init.body)
        }
        return new Response('created', { status: 201 })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      })

      expect(res.status).toBe(201)
      expect(capturedMethod).toBe('POST')
      expect(capturedBody).toBe('{"name":"test"}')
    })

    it('forwards response headers from upstream', async () => {
      globalThis.fetch = (async () => {
        return new Response('ok', {
          status: 200,
          headers: {
            'X-Custom-Header': 'custom-value',
            'Content-Type': 'text/plain',
          },
        })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/test')
      expect(res.headers.get('x-custom-header')).toBe('custom-value')
    })

    it('strips Host and Authorization headers from the forwarded request', async () => {
      let capturedHeaders: Headers | null = null

      globalThis.fetch = (async (_input: any, init: any) => {
        capturedHeaders = init?.headers
        return new Response('ok')
      }) as typeof fetch

      await app.request('/proxy/3000/test', {
        headers: {
          'Authorization': 'Bearer secret',
          'X-Custom': 'keep-me',
        },
      })

      expect(capturedHeaders).not.toBeNull()
      // Authorization should be stripped
      expect(capturedHeaders!.get('authorization')).toBeNull()
      // Host should be set to the upstream
      expect(capturedHeaders!.get('host')).toBe('localhost:3000')
      // Other headers should be forwarded
      expect(capturedHeaders!.get('x-custom')).toBe('keep-me')
    })

    it('proxies root path with trailing slash', async () => {
      let capturedUrl = ''

      globalThis.fetch = (async (input: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString()
        return new Response('ok')
      }) as typeof fetch

      await app.request('/proxy/3000/')

      expect(capturedUrl).toBe('http://localhost:3000/')
    })

    it('rewrites Location headers for redirects from upstream', async () => {
      globalThis.fetch = (async () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: 'http://localhost:3000/login',
          },
        })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/dashboard')

      expect(res.status).toBe(302)
      // Location should be rewritten to go through the proxy
      expect(res.headers.get('location')).toBe('/proxy/3000/login')
    })

    it('does not rewrite Location headers for different hosts', async () => {
      globalThis.fetch = (async () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: 'https://example.com/login',
          },
        })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/dashboard')

      expect(res.status).toBe(302)
      // External redirect should NOT be rewritten
      expect(res.headers.get('location')).toBe('https://example.com/login')
    })
  })

  // ─── Blocked port ────────────────────────────────────────────────────

  describe('blocked port', () => {
    it('returns 403 for the Kortix Master port (default 8000)', async () => {
      const blockedPort = config.PORT // Should be 8000

      const res = await app.request(`/proxy/${blockedPort}/anything`)
      expect(res.status).toBe(403)

      const body = await res.json()
      expect(body.error).toContain('blocked')
      expect(body.port).toBe(blockedPort)
    })

    it('does not call fetch for blocked ports', async () => {
      let fetchCalled = false
      globalThis.fetch = (async () => {
        fetchCalled = true
        return new Response('ok')
      }) as typeof fetch

      await app.request(`/proxy/${config.PORT}/anything`)
      expect(fetchCalled).toBe(false)
    })
  })

  // ─── Invalid port ────────────────────────────────────────────────────

  describe('invalid port', () => {
    it('returns 400 for port 0', async () => {
      const res = await app.request('/proxy/0/test')
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error).toContain('Invalid port')
    })

    it('returns 400 for port > 65535', async () => {
      const res = await app.request('/proxy/99999/test')
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error).toContain('Invalid port')
    })

    it('does not match non-numeric port segments', async () => {
      // The route pattern /:port{[0-9]+} only matches digits
      const res = await app.request('/proxy/abc/test')
      expect(res.status).toBe(404)
    })
  })

  // ─── Bare /proxy/:port (no trailing path) ────────────────────────────

  describe('bare /proxy/:port (no trailing slash)', () => {
    it('proxies to root path when accessed without trailing slash', async () => {
      // Hono's wildcard route /:port{[0-9]+}/* also matches bare /proxy/:port
      // In this case the remaining path becomes "/" (root)
      let capturedUrl = ''

      globalThis.fetch = (async (input: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString()
        return new Response('ok')
      }) as typeof fetch

      const res = await app.request('/proxy/3000')

      expect(res.status).toBe(200)
      expect(capturedUrl).toBe('http://localhost:3000/')
    })
  })

  // ─── Proxy error (upstream unreachable) ──────────────────────────────

  describe('proxy error handling', () => {
    it('returns 502 when upstream connection fails', async () => {
      globalThis.fetch = (async () => {
        throw new Error('Connection refused')
      }) as typeof fetch

      const res = await app.request('/proxy/9999/test')
      expect(res.status).toBe(502)

      const body = await res.json()
      expect(body.error).toContain('Failed to connect')
      expect(body.port).toBe(9999)
      expect(body.hint).toContain('9999')
    })

    it('returns 502 with details when fetch rejects', async () => {
      globalThis.fetch = (async () => {
        throw new TypeError('fetch failed')
      }) as typeof fetch

      const res = await app.request('/proxy/4567/api')
      expect(res.status).toBe(502)

      const body = await res.json()
      expect(body.details).toContain('fetch failed')
    })

    it('includes the port number in the error response', async () => {
      globalThis.fetch = (async () => {
        throw new Error('ECONNREFUSED')
      }) as typeof fetch

      const res = await app.request('/proxy/8080/api')
      expect(res.status).toBe(502)

      const body = await res.json()
      expect(body.port).toBe(8080)
    })
  })

  // ─── Various HTTP methods ────────────────────────────────────────────

  describe('HTTP methods', () => {
    it('proxies PUT requests', async () => {
      let capturedMethod = ''
      globalThis.fetch = (async (_input: any, init: any) => {
        capturedMethod = init?.method || 'GET'
        return new Response('ok')
      }) as typeof fetch

      const res = await app.request('/proxy/3000/resource', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updated: true }),
      })

      expect(res.status).toBe(200)
      expect(capturedMethod).toBe('PUT')
    })

    it('proxies DELETE requests', async () => {
      let capturedMethod = ''
      globalThis.fetch = (async (_input: any, init: any) => {
        capturedMethod = init?.method || 'GET'
        return new Response(null, { status: 204 })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/resource/1', {
        method: 'DELETE',
      })

      expect(res.status).toBe(204)
      expect(capturedMethod).toBe('DELETE')
    })

    it('proxies PATCH requests', async () => {
      let capturedMethod = ''
      globalThis.fetch = (async (_input: any, init: any) => {
        capturedMethod = init?.method || 'GET'
        return new Response('ok')
      }) as typeof fetch

      const res = await app.request('/proxy/3000/resource', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial: true }),
      })

      expect(res.status).toBe(200)
      expect(capturedMethod).toBe('PATCH')
    })

    it('proxies HEAD requests without body', async () => {
      let capturedMethod = ''
      let capturedBody: any = 'NOT_NULL'
      globalThis.fetch = (async (_input: any, init: any) => {
        capturedMethod = init?.method || 'GET'
        capturedBody = init?.body
        return new Response(null, {
          status: 200,
          headers: { 'Content-Length': '42' },
        })
      }) as typeof fetch

      const res = await app.request('/proxy/3000/resource', {
        method: 'HEAD',
      })

      expect(res.status).toBe(200)
      expect(capturedMethod).toBe('HEAD')
      // HEAD requests should not send a body
      expect(capturedBody).toBeUndefined()
    })
  })

  // ─── Nested / deep paths ─────────────────────────────────────────────

  describe('deep paths', () => {
    it('handles deeply nested paths', async () => {
      let capturedUrl = ''
      globalThis.fetch = (async (input: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString()
        return new Response('ok')
      }) as typeof fetch

      await app.request('/proxy/3000/a/b/c/d/e')
      expect(capturedUrl).toBe('http://localhost:3000/a/b/c/d/e')
    })

    it('handles paths with special URL characters', async () => {
      let capturedUrl = ''
      globalThis.fetch = (async (input: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString()
        return new Response('ok')
      }) as typeof fetch

      await app.request('/proxy/3000/api/items?q=hello%20world&page=1')
      expect(capturedUrl).toContain('http://localhost:3000/api/items')
      expect(capturedUrl).toContain('q=hello%20world')
    })
  })
})
