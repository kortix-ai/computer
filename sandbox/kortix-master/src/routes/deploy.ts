import { Hono } from 'hono'
import { Deployer } from '../services/deployer'
import type { DeploymentConfig } from '../services/deployer'

const deployRouter = new Hono()
const deployer = new Deployer()

// POST / — Deploy an app
deployRouter.post('/', async (c) => {
  try {
    const body = await c.req.json() as Partial<DeploymentConfig>

    if (!body.deploymentId) {
      return c.json({ error: 'deploymentId is required' }, 400)
    }

    const config: DeploymentConfig = {
      deploymentId: body.deploymentId,
      sourceType: body.sourceType || 'files',
      sourceRef: body.sourceRef,
      sourcePath: body.sourcePath || '/workspace',
      framework: body.framework,
      envVarKeys: body.envVarKeys,
      buildConfig: body.buildConfig,
      entrypoint: body.entrypoint,
    }

    console.log(`[Deploy API] Starting deployment ${config.deploymentId} from ${config.sourcePath}`)
    const result = await deployer.deploy(config)

    const status = result.success ? 200 : 500
    return c.json({
      success: result.success,
      port: result.port,
      pid: result.pid,
      framework: result.framework,
      error: result.error,
      logs: result.logs,
      buildDuration: result.buildDuration,
      startDuration: result.startDuration,
    }, status)
  } catch (error) {
    console.error('[Deploy API] Unexpected error:', error)
    return c.json({ error: 'Failed to process deployment request', details: String(error) }, 500)
  }
})

// POST /:id/stop — Stop a deployment
deployRouter.post('/:id/stop', async (c) => {
  try {
    const id = c.req.param('id')
    const result = deployer.stop(id)

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 404)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('[Deploy API] Error stopping deployment:', error)
    return c.json({ error: 'Failed to stop deployment', details: String(error) }, 500)
  }
})

// GET /:id/logs — Get deployment logs
deployRouter.get('/:id/logs', async (c) => {
  try {
    const id = c.req.param('id')
    const result = deployer.getLogs(id)

    if (result.error) {
      return c.json({ logs: [], error: result.error }, 404)
    }

    return c.json({ logs: result.logs })
  } catch (error) {
    console.error('[Deploy API] Error getting logs:', error)
    return c.json({ error: 'Failed to get deployment logs', details: String(error) }, 500)
  }
})

// GET /:id/status — Get deployment status
deployRouter.get('/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const result = deployer.getStatus(id)

    if (result.status === 'not_found') {
      return c.json({ status: 'not_found', error: `Deployment not found: ${id}` }, 404)
    }

    return c.json({
      status: result.status,
      port: result.port,
      pid: result.pid,
      framework: result.framework,
      startedAt: result.startedAt,
    })
  } catch (error) {
    console.error('[Deploy API] Error getting status:', error)
    return c.json({ error: 'Failed to get deployment status', details: String(error) }, 500)
  }
})

// GET / — List all running deployments
deployRouter.get('/', async (c) => {
  try {
    const deployments = deployer.listDeployments()
    return c.json({ deployments })
  } catch (error) {
    console.error('[Deploy API] Error listing deployments:', error)
    return c.json({ error: 'Failed to list deployments', details: String(error) }, 500)
  }
})

export default deployRouter
