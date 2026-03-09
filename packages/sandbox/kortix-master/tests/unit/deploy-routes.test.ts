/**
 * Unit tests for the deploy routes (kortix-master).
 *
 * Tests the Hono router that wraps the Deployer service.
 * Uses real Deployer with temp directories — no mocking.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Hono } from 'hono'

// We can't import the router directly because it has a module-level Deployer
// singleton. Instead, we build a fresh one for testing.
import { Deployer } from '../../src/services/deployer'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-routes-test-'))
  tempDirs.push(dir)
  return dir
}

// Build a test app with a fresh deployer
const deployer = new Deployer()
const app = new Hono()

// Mount deploy routes inline (mirror the real router but with our deployer)
app.post('/kortix/deploy', async (c) => {
  const body = await c.req.json()
  if (!body.deploymentId) {
    return c.json({ error: 'deploymentId is required' }, 400)
  }
  const result = await deployer.deploy({
    deploymentId: body.deploymentId,
    sourceType: body.sourceType || 'files',
    sourceRef: body.sourceRef,
    sourcePath: body.sourcePath || '/workspace',
    framework: body.framework,
    envVarKeys: body.envVarKeys,
    buildConfig: body.buildConfig,
    entrypoint: body.entrypoint,
  })
  return c.json({
    success: result.success,
    port: result.port,
    pid: result.pid,
    framework: result.framework,
    error: result.error,
    logs: result.logs,
  }, result.success ? 200 : 500)
})

app.post('/kortix/deploy/:id/stop', (c) => {
  const id = c.req.param('id')
  const result = deployer.stop(id)
  if (!result.success) return c.json({ success: false, error: result.error }, 404)
  return c.json({ success: true })
})

app.get('/kortix/deploy/:id/logs', (c) => {
  const id = c.req.param('id')
  const result = deployer.getLogs(id)
  if (result.error) return c.json({ logs: [], error: result.error }, 404)
  return c.json({ logs: result.logs })
})

app.get('/kortix/deploy/:id/status', (c) => {
  const id = c.req.param('id')
  const result = deployer.getStatus(id)
  if (result.status === 'not_found') return c.json({ status: 'not_found' }, 404)
  return c.json({ status: result.status, port: result.port, pid: result.pid, framework: result.framework })
})

app.get('/kortix/deploy', (c) => {
  const list = deployer.listDeployments()
  return c.json({ deployments: list })
})

// Cleanup
afterAll(async () => {
  for (const dep of deployer.listDeployments()) {
    deployer.stop(dep.deploymentId)
  }
  await Bun.sleep(500)
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

// ─── Helper ──────────────────────────────────────────────────────────────────

function jsonPost(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function jsonGet(path: string) {
  return app.request(path, { method: 'GET' })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Deploy Routes — POST /kortix/deploy', () => {
  it('returns 400 when deploymentId is missing', async () => {
    const res = await jsonPost('/kortix/deploy', { sourceType: 'files' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('deploymentId')
  })

  it('deploys a simple Bun server via API', async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'server.js'), `
      Bun.serve({
        port: process.env.PORT,
        fetch: () => new Response('route-test'),
      })
    `)

    const res = await jsonPost('/kortix/deploy', {
      deploymentId: `route-test-${Date.now()}`,
      sourceType: 'files',
      sourcePath: dir,
      framework: 'node',
      entrypoint: 'bun server.js',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.port).toBeDefined()
    expect(body.pid).toBeDefined()
    expect(body.framework).toBe('node')

    // Verify the app responds
    const appRes = await fetch(`http://localhost:${body.port}`)
    expect(await appRes.text()).toBe('route-test')
  }, 30000)

  it('returns 500 for non-existent source path', async () => {
    const res = await jsonPost('/kortix/deploy', {
      deploymentId: `route-fail-${Date.now()}`,
      sourceType: 'files',
      sourcePath: '/nonexistent/path',
    })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Source path not found')
  })
})

describe('Deploy Routes — GET /kortix/deploy (list)', () => {
  it('returns a list of deployments', async () => {
    const res = await jsonGet('/kortix/deploy')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deployments).toBeArray()
    // Should have at least the one from the previous test
    expect(body.deployments.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Deploy Routes — GET /kortix/deploy/:id/status', () => {
  it('returns 404 for non-existent deployment', async () => {
    const res = await jsonGet('/kortix/deploy/nonexistent/status')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.status).toBe('not_found')
  })

  it('returns status for running deployment', async () => {
    const list = deployer.listDeployments()
    if (list.length === 0) return // skip if nothing running

    const res = await jsonGet(`/kortix/deploy/${list[0].deploymentId}/status`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('running')
    expect(body.port).toBeDefined()
  })
})

describe('Deploy Routes — GET /kortix/deploy/:id/logs', () => {
  it('returns 404 for non-existent deployment', async () => {
    const res = await jsonGet('/kortix/deploy/nonexistent/logs')
    expect(res.status).toBe(404)
  })

  it('returns logs for running deployment', async () => {
    const list = deployer.listDeployments()
    if (list.length === 0) return

    const res = await jsonGet(`/kortix/deploy/${list[0].deploymentId}/logs`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.logs).toBeArray()
  })
})

describe('Deploy Routes — POST /kortix/deploy/:id/stop', () => {
  it('returns 404 for non-existent deployment', async () => {
    const res = await jsonPost('/kortix/deploy/nonexistent/stop', {})
    expect(res.status).toBe(404)
  })

  it('stops a running deployment', async () => {
    const list = deployer.listDeployments()
    if (list.length === 0) return

    const id = list[0].deploymentId
    const res = await jsonPost(`/kortix/deploy/${id}/stop`, {})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Verify it's gone
    const statusRes = await jsonGet(`/kortix/deploy/${id}/status`)
    expect(statusRes.status).toBe(404)
  })
})
