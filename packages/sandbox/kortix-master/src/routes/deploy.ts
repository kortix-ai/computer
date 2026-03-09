import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { Deployer } from '../services/deployer'
import type { DeploymentConfig } from '../services/deployer'
import {
  ErrorResponse,
  DeployResponse,
  DeploymentStatus,
  DeploymentListResponse,
  DeploymentLogsResponse,
} from '../schemas/common'

const deployRouter = new Hono()
export const deployer = new Deployer()

// POST / — Deploy an app
deployRouter.post('/',
  describeRoute({
    tags: ['Deployments'],
    summary: 'Deploy an app',
    description: 'Deploys an application from the sandbox workspace. Auto-detects framework, builds, and starts the app on an available port.',
    responses: {
      200: { description: 'Deployment result', content: { 'application/json': { schema: resolver(DeployResponse) } } },
      400: { description: 'Missing deploymentId', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      500: { description: 'Deployment failed', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
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
  },
)

// POST /:id/stop — Stop a deployment
deployRouter.post('/:id/stop',
  describeRoute({
    tags: ['Deployments'],
    summary: 'Stop a deployment',
    description: 'Stops a running deployment by its ID.',
    responses: {
      200: { description: 'Deployment stopped', content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true) })) } } },
      404: { description: 'Deployment not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
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
  },
)

// GET /:id/logs — Get deployment logs
deployRouter.get('/:id/logs',
  describeRoute({
    tags: ['Deployments'],
    summary: 'Get deployment logs',
    description: 'Returns the build and runtime logs for a specific deployment.',
    responses: {
      200: { description: 'Deployment logs', content: { 'application/json': { schema: resolver(DeploymentLogsResponse) } } },
      404: { description: 'Deployment not found', content: { 'application/json': { schema: resolver(DeploymentLogsResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
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
  },
)

// GET /:id/status — Get deployment status
deployRouter.get('/:id/status',
  describeRoute({
    tags: ['Deployments'],
    summary: 'Get deployment status',
    description: 'Returns the current status of a deployment (running, stopped, or not_found).',
    responses: {
      200: { description: 'Deployment status', content: { 'application/json': { schema: resolver(DeploymentStatus) } } },
      404: { description: 'Deployment not found', content: { 'application/json': { schema: resolver(DeploymentStatus) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
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
  },
)

// GET / — List all running deployments
deployRouter.get('/',
  describeRoute({
    tags: ['Deployments'],
    summary: 'List deployments',
    description: 'Returns all active deployments with their status, port, and framework info.',
    responses: {
      200: { description: 'Deployment list', content: { 'application/json': { schema: resolver(DeploymentListResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    try {
      const deployments = deployer.listDeployments()
      return c.json({ deployments })
    } catch (error) {
      console.error('[Deploy API] Error listing deployments:', error)
      return c.json({ error: 'Failed to list deployments', details: String(error) }, 500)
    }
  },
)

export default deployRouter

// z import needed for inline resolver usage
import { z } from 'zod'
