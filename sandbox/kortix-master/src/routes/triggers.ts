import { Hono } from 'hono'
import { discoverAgentsWithTriggers, type WebhookTriggerConfig } from '@kortix/opencode-agent-triggers'
import { getCronManager } from '../services/cron-manager'

const triggersRouter = new Hono()
const cronManager = getCronManager()

triggersRouter.get('/', (c) => {
  const cronTriggers = cronManager.listTriggers()
  const cronByName = new Map(cronTriggers.map((trigger) => [trigger.name, trigger]))
  const discovered = discoverAgentsWithTriggers({ directory: '/workspace', homeDir: '/workspace' })

  const data = [
    ...cronTriggers.map((trigger) => ({
      id: trigger.triggerId,
      triggerId: trigger.triggerId,
      type: 'cron',
      sourceType: trigger.name.includes(':') ? 'agent' : 'manual',
      name: trigger.name,
      description: trigger.description,
      prompt: trigger.prompt,
      enabled: trigger.isActive,
      isActive: trigger.isActive,
      editable: !trigger.name.includes(':'),
      cronExpr: trigger.cronExpr,
      timezone: trigger.timezone,
      nextRunAt: trigger.nextRunAt,
      lastRunAt: trigger.lastRunAt,
      sessionMode: trigger.sessionMode,
      agentName: trigger.agentName,
      modelId: trigger.modelId,
      modelProviderId: trigger.modelProviderId,
      webhook: null,
      agentFilePath: null,
      createdAt: trigger.createdAt,
      updatedAt: trigger.updatedAt,
    })),
    ...discovered.flatMap((agent) =>
      agent.triggers
        .filter((trigger): trigger is WebhookTriggerConfig => trigger.source.type === 'webhook')
        .map((trigger) => ({
          id: `${agent.name}:${trigger.name}`,
          triggerId: null,
          type: 'webhook',
          sourceType: 'agent',
          name: trigger.name,
          description: null,
          prompt: trigger.execution.prompt,
          enabled: trigger.enabled !== false,
          isActive: trigger.enabled !== false,
          editable: false,
          cronExpr: null,
          timezone: null,
          nextRunAt: null,
          lastRunAt: null,
          sessionMode: trigger.execution.sessionMode ?? 'new',
          agentName: trigger.execution.agentName ?? agent.name,
          modelId: trigger.execution.modelId ?? null,
          modelProviderId: trigger.execution.modelId?.split('/')[0] ?? null,
          webhook: {
            path: trigger.source.path,
            method: trigger.source.method ?? 'POST',
            secretProtected: Boolean(trigger.source.secret),
          },
          agentFilePath: agent.filePath,
          createdAt: cronByName.get(`${agent.name}:${trigger.name}`)?.createdAt ?? new Date().toISOString(),
          updatedAt: cronByName.get(`${agent.name}:${trigger.name}`)?.updatedAt ?? new Date().toISOString(),
        })),
    ),
  ]

  return c.json({ success: true, data, total: data.length })
})

export default triggersRouter
