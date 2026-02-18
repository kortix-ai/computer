import { Hono } from 'hono'
import { config } from '../config'

const integrationsRouter = new Hono()

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || ''

// Internal service auth middleware (same pattern as env.ts)
integrationsRouter.use('*', async (c, next) => {
  if (!INTERNAL_SERVICE_KEY) return next()

  const auth = c.req.header('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

  if (token !== INTERNAL_SERVICE_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
})

/**
 * POST /api/integrations/token
 * Proxy to kortix-api: POST /v1/integrations/token
 * Used by agent tools to fetch OAuth tokens for third-party APIs.
 */
integrationsRouter.post('/token', async (c) => {
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
})


integrationsRouter.post('/proxy', async (c) => {
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
})

integrationsRouter.get('/list', async (c) => {
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
})

integrationsRouter.get('/actions', async (c) => {
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
})

integrationsRouter.post('/connect', async (c) => {
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
})

integrationsRouter.get('/search-apps', async (c) => {
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
})

integrationsRouter.post('/run-action', async (c) => {
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
})

export default integrationsRouter
