import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { z } from 'zod'
import { getCronManager } from '../services/cron-manager'
import { describeCron, isValidCronExpression } from '../services/cron-store'

const cronRouter = new Hono()
const cronManager = getCronManager()

const createTriggerSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  cron_expr: z.string().min(1).max(100).refine(isValidCronExpression, {
    message: 'Invalid cron expression. Use 6-field format: second minute hour day month weekday',
  }),
  timezone: z.string().default('UTC'),
  agent_name: z.string().optional(),
  model_provider_id: z.string().max(255).optional(),
  model_id: z.string().max(255).optional(),
  prompt: z.string().min(1),
  session_mode: z.enum(['new', 'reuse']).default('new'),
  session_id: z.string().optional(),
  max_retries: z.number().int().min(0).max(10).default(0),
  timeout_ms: z.number().int().min(1000).max(3600000).default(300000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const updateTriggerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  cron_expr: z.string().min(1).max(100).refine(isValidCronExpression, { message: 'Invalid cron expression' }).optional(),
  timezone: z.string().optional(),
  agent_name: z.string().nullable().optional(),
  model_provider_id: z.string().max(255).nullable().optional(),
  model_id: z.string().max(255).nullable().optional(),
  prompt: z.string().min(1).optional(),
  session_mode: z.enum(['new', 'reuse']).optional(),
  session_id: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  timeout_ms: z.number().int().min(1000).max(3600000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

function notFound(c: any, resource: string) {
  return c.json({ error: `${resource} not found` }, 404)
}

cronRouter.get('/triggers',
  describeRoute({ tags: ['System'], summary: 'List scheduled tasks', responses: { 200: { description: 'Trigger list' } } }),
  (c) => {
    const activeParam = c.req.query('active')
    const active = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined
    const data = cronManager.listTriggers(active).map((trigger) => ({ ...trigger, scheduleDescription: describeCron(trigger.cronExpr) }))
    return c.json({ success: true, data, total: data.length })
  },
)

cronRouter.post('/triggers',
  describeRoute({ tags: ['System'], summary: 'Create scheduled task', responses: { 201: { description: 'Created trigger' }, 400: { description: 'Invalid trigger' } } }),
  async (c) => {
    const body = await c.req.json()
    const parsed = createTriggerSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.issues.map((issue) => issue.message).join(', ') }, 400)
    const trigger = cronManager.createTrigger(parsed.data)
    return c.json({ success: true, data: trigger }, 201)
  },
)

cronRouter.get('/triggers/:id',
  describeRoute({ tags: ['System'], summary: 'Get scheduled task', responses: { 200: { description: 'Trigger details' }, 404: { description: 'Not found' } } }),
  (c) => {
    const trigger = cronManager.getTrigger(c.req.param('id'))
    if (!trigger) return notFound(c, 'Trigger')
    return c.json({ success: true, data: trigger })
  },
)

cronRouter.patch('/triggers/:id',
  describeRoute({ tags: ['System'], summary: 'Update scheduled task', responses: { 200: { description: 'Updated trigger' }, 400: { description: 'Invalid update' }, 404: { description: 'Not found' } } }),
  async (c) => {
    const body = await c.req.json()
    const parsed = updateTriggerSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.issues.map((issue) => issue.message).join(', ') }, 400)
    const trigger = cronManager.updateTrigger(c.req.param('id'), parsed.data)
    if (!trigger) return notFound(c, 'Trigger')
    return c.json({ success: true, data: trigger })
  },
)

cronRouter.delete('/triggers/:id',
  describeRoute({ tags: ['System'], summary: 'Delete scheduled task', responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } }),
  (c) => {
    const deleted = cronManager.deleteTrigger(c.req.param('id'))
    if (!deleted) return notFound(c, 'Trigger')
    return c.json({ success: true, message: 'Trigger deleted' })
  },
)

cronRouter.post('/triggers/:id/pause',
  describeRoute({ tags: ['System'], summary: 'Pause scheduled task', responses: { 200: { description: 'Paused' }, 404: { description: 'Not found' } } }),
  (c) => {
    const trigger = cronManager.pauseTrigger(c.req.param('id'))
    if (!trigger) return notFound(c, 'Trigger')
    return c.json({ success: true, data: trigger })
  },
)

cronRouter.post('/triggers/:id/resume',
  describeRoute({ tags: ['System'], summary: 'Resume scheduled task', responses: { 200: { description: 'Resumed' }, 404: { description: 'Not found' } } }),
  (c) => {
    const trigger = cronManager.resumeTrigger(c.req.param('id'))
    if (!trigger) return notFound(c, 'Trigger')
    return c.json({ success: true, data: trigger })
  },
)

cronRouter.post('/triggers/:id/run',
  describeRoute({ tags: ['System'], summary: 'Run scheduled task now', responses: { 200: { description: 'Run queued' }, 404: { description: 'Not found' } } }),
  async (c) => {
    const result = await cronManager.runTrigger(c.req.param('id'), { manual: true })
    if (!result) return notFound(c, 'Trigger')
    return c.json({
      success: true,
      data: {
        execution_id: result.executionId,
        status: 'running',
        message: 'Trigger execution started',
      },
    })
  },
)

cronRouter.get('/executions',
  describeRoute({ tags: ['System'], summary: 'List task executions', responses: { 200: { description: 'Executions list' } } }),
  (c) => {
    const status = c.req.query('status') as any
    const triggerId = c.req.query('trigger_id')
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    const result = cronManager.listExecutions({ status, triggerId: triggerId || undefined, limit, offset })
    return c.json({ success: true, data: result.data, total: result.total, limit, offset })
  },
)

cronRouter.get('/executions/:id',
  describeRoute({ tags: ['System'], summary: 'Get task execution', responses: { 200: { description: 'Execution details' }, 404: { description: 'Not found' } } }),
  (c) => {
    const execution = cronManager.getExecution(c.req.param('id'))
    if (!execution) return notFound(c, 'Execution')
    return c.json({ success: true, data: execution })
  },
)

cronRouter.get('/executions/by-trigger/:triggerId',
  describeRoute({ tags: ['System'], summary: 'List executions for a task', responses: { 200: { description: 'Execution list' }, 404: { description: 'Not found' } } }),
  (c) => {
    const trigger = cronManager.getTrigger(c.req.param('triggerId'))
    if (!trigger) return notFound(c, 'Trigger')
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    const result = cronManager.listExecutions({ triggerId: trigger.triggerId, limit, offset })
    return c.json({ success: true, data: result.data, total: result.total, limit, offset })
  },
)

export default cronRouter
