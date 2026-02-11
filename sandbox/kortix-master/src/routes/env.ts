import { Hono } from 'hono'
import { SecretStore } from '../services/secret-store'

const envRouter = new Hono()
const secretStore = new SecretStore()

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
    
    if (!body || typeof body.value !== 'string') {
      return c.json({ error: 'Request body must contain a "value" field with string value' }, 400)
    }

    await secretStore.setEnv(key, body.value)
    console.log(`[ENV API] Set environment variable: ${key}`)
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
    await secretStore.deleteEnv(key)
    console.log(`[ENV API] Deleted environment variable: ${key}`)
    return c.json({ message: 'Environment variable deleted', key })
  } catch (error) {
    console.error('[ENV API] Error deleting environment variable:', error)
    return c.json({ error: 'Failed to delete environment variable' }, 500)
  }
})

export default envRouter