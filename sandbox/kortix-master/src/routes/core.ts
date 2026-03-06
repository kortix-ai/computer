import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { coreSupervisor } from '../services/core-supervisor'

const coreRouter = new Hono()

coreRouter.get('/status',
  describeRoute({
    tags: ['System'],
    summary: 'Core supervisor status',
    description: 'Returns current core supervisor state and managed service statuses.',
    responses: { 200: { description: 'Core status' } },
  }),
  (c) => {
    return c.json(coreSupervisor.getStatus())
  },
)

coreRouter.post('/reconcile',
  describeRoute({
    tags: ['System'],
    summary: 'Reconcile core services from disk',
    description: 'Reloads /opt/kortix/core/service-spec.json and reconciles running services.',
    responses: { 200: { description: 'Reconcile result' }, 500: { description: 'Reconcile failed' } },
  }),
  async (c) => {
    try {
      const result = await coreSupervisor.reconcileFromDisk()
      if (!result.ok) return c.json({ success: false, error: result.output }, 500)
      return c.json({ success: true, output: result.output, status: coreSupervisor.getStatus() })
    } catch (e) {
      return c.json({ success: false, error: String(e) }, 500)
    }
  },
)

coreRouter.post('/restart/:service',
  describeRoute({
    tags: ['System'],
    summary: 'Restart a core-managed service',
    description: 'Restarts a single service managed by the core supervisor.',
    responses: { 200: { description: 'Restart result' }, 404: { description: 'Service not found' }, 500: { description: 'Restart failed' } },
  }),
  async (c) => {
    const service = c.req.param('service')
    const result = await coreSupervisor.restartService(service)
    if (!result.ok && result.output.includes('Unknown service')) {
      return c.json({ success: false, error: result.output }, 404)
    }
    if (!result.ok) {
      return c.json({ success: false, error: result.output }, 500)
    }
    return c.json({ success: true, output: result.output, status: coreSupervisor.getStatus() })
  },
)

export default coreRouter
