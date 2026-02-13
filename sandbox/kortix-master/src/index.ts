import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxyToOpenCode } from './services/proxy'
import { SecretStore } from './services/secret-store'
import envRouter from './routes/env'
import proxyRouter from './routes/proxy'
import updateRouter from './routes/update'
import { config } from './config'

const app = new Hono()

// Initialize secret store and load ENV variables
const secretStore = new SecretStore()
await secretStore.loadIntoProcessEnv()

// Global middleware
app.use('*', logger())
app.use('*', cors())

// Health check — includes current sandbox version
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

// Update check — /kortix/update and /kortix/update/status
app.route('/kortix/update', updateRouter)

// ENV management routes
app.route('/env', envRouter)

// Dynamic port proxy — /proxy/:port/* forwards to localhost:{port} inside the sandbox
app.route('/proxy', proxyRouter)

// Proxy all other requests to OpenCode
app.all('*', async (c) => {
  return proxyToOpenCode(c)
})

console.log(`[Kortix Master] Starting on port ${config.PORT}`)
console.log(`[Kortix Master] Proxying to OpenCode at ${config.OPENCODE_HOST}:${config.OPENCODE_PORT}`)

export default {
  port: config.PORT,
  fetch: app.fetch,
}
