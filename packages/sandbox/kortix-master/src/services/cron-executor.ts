import { config } from '../config'
import type { CronStore, TriggerRecord } from './cron-store'
import { getNextRun } from './cron-store'

interface CreateSessionResponse {
  id: string
}

function buildPromptBody(trigger: TriggerRecord): Record<string, unknown> {
  const hasModelOverride = trigger.modelProviderId && trigger.modelId
  const body: Record<string, unknown> = {
    parts: [{ type: 'text', text: trigger.prompt }],
  }

  if (hasModelOverride) {
    body.model = { providerID: trigger.modelProviderId, modelID: trigger.modelId }
  }

  if (trigger.agentName) body.agent = trigger.agentName
  return body
}

export class CronExecutor {
  constructor(private store: CronStore) {}

  async runTrigger(trigger: TriggerRecord, options?: { manual?: boolean }): Promise<{ executionId: string }> {
    const runAt = new Date()
    const execution = this.store.createExecution(trigger.triggerId, {
      status: 'running',
      metadata: options?.manual ? { manual: true } : {},
    })
    const nextRun = trigger.isActive ? getNextRun(trigger.cronExpr, trigger.timezone) : null
    this.store.markTriggerRun(trigger.triggerId, runAt, nextRun)

    void this.executeAttempt(trigger, execution.executionId, 0, execution.metadata)
    return { executionId: execution.executionId }
  }

  private async executeAttempt(
    trigger: TriggerRecord,
    executionId: string,
    retryCount: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const startTime = Date.now()
    try {
      const result = await this.executePrompt(trigger)
      const durationMs = Date.now() - startTime
      const mergedMetadata = { ...metadata, response: result.response }
      this.store.updateExecution(executionId, {
        status: 'completed',
        sessionId: result.sessionId,
        completedAt: new Date().toISOString(),
        durationMs,
        retryCount,
        metadata: mergedMetadata,
      })

      if (trigger.sessionMode === 'reuse' && !trigger.sessionId) {
        this.store.updateTriggerSession(trigger.triggerId, result.sessionId)
      }
    } catch (error) {
      const durationMs = Date.now() - startTime
      const message = error instanceof Error ? error.message : String(error)
      const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))

      this.store.updateExecution(executionId, {
        status: isTimeout ? 'timeout' : 'failed',
        completedAt: new Date().toISOString(),
        durationMs,
        errorMessage: message,
        retryCount,
        metadata,
      })

      if (retryCount < trigger.maxRetries) {
        const retryExecution = this.store.createExecution(trigger.triggerId, {
          status: 'running',
          retryCount: retryCount + 1,
          metadata: { ...metadata, retryOf: executionId, retryNumber: retryCount + 1 },
        })
        await this.executeAttempt(trigger, retryExecution.executionId, retryCount + 1, retryExecution.metadata)
      }
    }
  }

  private async executePrompt(trigger: TriggerRecord): Promise<{ sessionId: string; response: { accepted: true } }> {
    const baseUrl = `http://${config.OPENCODE_HOST}:${config.OPENCODE_PORT}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), trigger.timeoutMs)

    try {
      if (trigger.sessionMode === 'reuse' && trigger.sessionId) {
        const res = await fetch(`${baseUrl}/session/${trigger.sessionId}/prompt_async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPromptBody(trigger)),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Failed to send prompt to session ${trigger.sessionId}: ${res.status} ${await res.text()}`)
        await res.text()
        return { sessionId: trigger.sessionId, response: { accepted: true } }
      }

      const sessionRes = await fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trigger.agentName ? { agent: trigger.agentName } : {}),
        signal: controller.signal,
      })
      if (!sessionRes.ok) throw new Error(`Failed to create session: ${sessionRes.status} ${await sessionRes.text()}`)
      const session = await sessionRes.json() as CreateSessionResponse

      const promptRes = await fetch(`${baseUrl}/session/${session.id}/prompt_async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPromptBody(trigger)),
        signal: controller.signal,
      })
      if (!promptRes.ok) throw new Error(`Failed to send prompt: ${promptRes.status} ${await promptRes.text()}`)
      await promptRes.text()
      return { sessionId: session.id, response: { accepted: true } }
    } finally {
      clearTimeout(timeout)
    }
  }
}
