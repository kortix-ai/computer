import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import { config } from '../config'
import { ErrorResponse } from '../schemas/common'

const integrationsRouter = new Hono()

// NOTE: Per-route auth middleware removed — global auth in index.ts now
// always enforces INTERNAL_SERVICE_KEY on all routes (auto-generated if not set).

/**
 * POST /api/integrations/token
 * Proxy to kortix-api: POST /v1/integrations/token
 * Used by agent tools to fetch OAuth tokens for third-party APIs.
 */
integrationsRouter.post('/token',
  describeRoute({
    tags: ['Integrations'],
    summary: 'Get OAuth token',
    description: 'Proxies to kortix-api to fetch an OAuth token for a connected third-party integration. Used by agent tools.',
    responses: {
      200: { description: 'OAuth token response', content: { 'application/json': { schema: resolver(z.object({ token: z.string(), expires_at: z.string().optional() }).passthrough()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const body = await c.req.json()
      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      c.header('Cache-Control', 'no-store')
      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] Token fetch error:', err)
      return c.json({ error: 'Failed to fetch integration token' }, 502)
    }
  },
)

integrationsRouter.post('/proxy',
  describeRoute({
    tags: ['Integrations'],
    summary: 'Proxy API request',
    description: 'Proxies an authenticated HTTP request to a third-party API on behalf of the user. OAuth credentials are injected automatically.',
    responses: {
      200: { description: 'Proxied API response', content: { 'application/json': { schema: resolver(z.any()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const body = await c.req.json()
      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      c.header('Cache-Control', 'no-store')
      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] Proxy request error:', err)
      return c.json({ error: 'Failed to proxy integration request' }, 502)
    }
  },
)

integrationsRouter.get('/list',
  describeRoute({
    tags: ['Integrations'],
    summary: 'List connected integrations',
    description: 'Returns the list of third-party apps that have been connected via OAuth for this sandbox.',
    responses: {
      200: { description: 'Integration list', content: { 'application/json': { schema: resolver(z.any()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/list`, {
        headers: {
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        signal: AbortSignal.timeout(15_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] List error:', err)
      return c.json({ error: 'Failed to list integrations' }, 502)
    }
  },
)

integrationsRouter.get('/actions',
  describeRoute({
    tags: ['Integrations'],
    summary: 'List available actions',
    description: 'Returns available actions for a connected integration app. Optionally filter by app slug and search query.',
    responses: {
      200: { description: 'Actions list', content: { 'application/json': { schema: resolver(z.any()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const appSlug = c.req.query('app')
      const query = c.req.query('q')
      const limit = c.req.query('limit')

      const params = new URLSearchParams()
      if (appSlug) params.set('app', appSlug)
      if (query) params.set('q', query)
      if (limit) params.set('limit', limit)

      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/actions?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        signal: AbortSignal.timeout(15_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] Actions list error:', err)
      return c.json({ error: 'Failed to list actions' }, 502)
    }
  },
)

integrationsRouter.post('/connect',
  describeRoute({
    tags: ['Integrations'],
    summary: 'Connect an app',
    description: 'Initiates OAuth connection for a third-party app. Returns a URL the user must visit to authorize the app.',
    responses: {
      200: { description: 'Connect URL', content: { 'application/json': { schema: resolver(z.object({ url: z.string() }).passthrough()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const body = await c.req.json()
      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] Connect error:', err)
      return c.json({ error: 'Failed to create connect token' }, 502)
    }
  },
)

integrationsRouter.get('/search-apps',
  describeRoute({
    tags: ['Integrations'],
    summary: 'Search available apps',
    description: 'Search for third-party apps available for OAuth connection. Returns app slugs, names, and descriptions.',
    responses: {
      200: { description: 'App search results', content: { 'application/json': { schema: resolver(z.any()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const query = c.req.query('q')
      const limit = c.req.query('limit')

      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (limit) params.set('limit', limit)

      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/search-apps?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        signal: AbortSignal.timeout(15_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] Search apps error:', err)
      return c.json({ error: 'Failed to search apps' }, 502)
    }
  },
)

integrationsRouter.post('/run-action',
  describeRoute({
    tags: ['Integrations'],
    summary: 'Run an action',
    description: 'Executes a specific action for a connected integration app with the given parameters.',
    responses: {
      200: { description: 'Action result', content: { 'application/json': { schema: resolver(z.any()) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      502: { description: 'Upstream error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const body = await c.req.json()
      const apiUrl = config.KORTIX_API_URL.replace(/\/v1\/router\/?$/, '/v1')
      const res = await fetch(`${apiUrl}/integrations/run-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.KORTIX_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return c.json(data, res.status as any)
      }

      c.header('Cache-Control', 'no-store')
      return c.json(data)
    } catch (err) {
      console.error('[Integrations Proxy] Run action error:', err)
      return c.json({ error: 'Failed to run action' }, 502)
    }
  },
)

export default integrationsRouter
