import type { CronExecutionRecord, CronTriggerConfig, CronTriggerRecord } from "./types.js"
import { CronManager } from "./cron-manager.js"

export class CronClient {
  constructor(private readonly manager: CronManager) {}

  async list(): Promise<CronTriggerRecord[]> {
    return this.manager.listTriggers()
  }

  async create(name: string, trigger: CronTriggerConfig, source: string): Promise<CronTriggerRecord> {
    return this.manager.createTrigger({
      name,
      cron_expr: trigger.source.expr,
      prompt: trigger.execution.prompt,
      timezone: trigger.source.timezone,
      agent_name: trigger.execution.agentName ?? null,
      model_id: trigger.execution.modelId,
      session_mode: trigger.execution.sessionMode,
      source,
      is_active: trigger.enabled !== false,
      metadata: {},
    })
  }

  async update(id: string, trigger: CronTriggerConfig, source: string): Promise<CronTriggerRecord | null> {
    return this.manager.updateTrigger(id, {
      name: trigger.name,
      cron_expr: trigger.source.expr,
      prompt: trigger.execution.prompt,
      timezone: trigger.source.timezone,
      agent_name: trigger.execution.agentName ?? null,
      model_id: trigger.execution.modelId,
      session_mode: trigger.execution.sessionMode,
      source,
      is_active: trigger.enabled !== false,
    })
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    return { ok: this.manager.deleteTrigger(id) }
  }

  async pause(id: string): Promise<CronTriggerRecord | null> {
    return this.manager.pauseTrigger(id)
  }

  async resume(id: string): Promise<CronTriggerRecord | null> {
    return this.manager.resumeTrigger(id)
  }

  async run(id: string): Promise<{ execution_id: string } | null> {
    const result = await this.manager.runTrigger(id, { manual: true })
    return result ? { execution_id: result.executionId } : null
  }

  async executions(id: string): Promise<CronExecutionRecord[]> {
    const trigger = this.manager.getTrigger(id)
    const triggerId = trigger?.id ?? id
    return this.manager.listExecutions({ triggerId }).data
  }
}
