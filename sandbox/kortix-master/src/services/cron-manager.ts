import { Cron } from 'croner'
import { CronExecutor } from './cron-executor'
import { CronStore, type CreateTriggerInput, type TriggerRecord, type UpdateTriggerInput, type ExecutionStatus } from './cron-store'

export class CronManager {
  private jobs = new Map<string, Cron>()
  private running = new Set<string>()
  private executor: CronExecutor

  constructor(private store: CronStore = new CronStore()) {
    this.executor = new CronExecutor(this.store)
  }

  start(): void {
    for (const trigger of this.store.listTriggers({ active: true })) {
      this.scheduleTrigger(trigger)
    }
  }

  stop(): void {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
    this.running.clear()
    this.store.close()
  }

  listTriggers(active?: boolean): TriggerRecord[] {
    return this.store.listTriggers({ active })
  }

  getTrigger(triggerId: string): TriggerRecord | null {
    return this.store.getTrigger(triggerId)
  }

  createTrigger(input: CreateTriggerInput): TriggerRecord {
    const trigger = this.store.createTrigger(input)
    if (trigger.isActive) this.scheduleTrigger(trigger)
    return trigger
  }

  updateTrigger(triggerId: string, input: UpdateTriggerInput): TriggerRecord | null {
    const trigger = this.store.updateTrigger(triggerId, input)
    if (!trigger) return null
    this.unscheduleTrigger(triggerId)
    if (trigger.isActive) this.scheduleTrigger(trigger)
    return trigger
  }

  deleteTrigger(triggerId: string): boolean {
    this.unscheduleTrigger(triggerId)
    return this.store.deleteTrigger(triggerId)
  }

  pauseTrigger(triggerId: string): TriggerRecord | null {
    this.unscheduleTrigger(triggerId)
    return this.store.setTriggerActive(triggerId, false)
  }

  resumeTrigger(triggerId: string): TriggerRecord | null {
    const trigger = this.store.setTriggerActive(triggerId, true)
    if (trigger) this.scheduleTrigger(trigger)
    return trigger
  }

  async runTrigger(triggerId: string, options?: { manual?: boolean }): Promise<{ executionId: string } | null> {
    const trigger = this.store.getTrigger(triggerId)
    if (!trigger) return null
    return this.invokeTrigger(trigger, options)
  }

  listExecutions(filters?: { status?: ExecutionStatus; triggerId?: string; limit?: number; offset?: number }) {
    return this.store.listExecutions(filters)
  }

  getExecution(executionId: string) {
    return this.store.getExecution(executionId)
  }

  private scheduleTrigger(trigger: TriggerRecord): void {
    this.unscheduleTrigger(trigger.triggerId)
    const job = new Cron(trigger.cronExpr, { timezone: trigger.timezone }, async () => {
      await this.invokeTrigger(trigger)
    })
    this.jobs.set(trigger.triggerId, job)
  }

  private unscheduleTrigger(triggerId: string): void {
    const job = this.jobs.get(triggerId)
    if (job) {
      job.stop()
      this.jobs.delete(triggerId)
    }
  }

  private async invokeTrigger(trigger: TriggerRecord, options?: { manual?: boolean }): Promise<{ executionId: string }> {
    const latest = this.store.getTrigger(trigger.triggerId)
    if (!latest) throw new Error('Trigger not found')
    if (this.running.has(trigger.triggerId)) {
      const skipped = this.store.createExecution(trigger.triggerId, {
        status: 'skipped',
        metadata: { reason: 'already_running', manual: options?.manual === true },
      })
      this.store.updateExecution(skipped.executionId, {
        status: 'skipped',
        completedAt: new Date().toISOString(),
        durationMs: 0,
        errorMessage: 'Trigger is already running',
        metadata: skipped.metadata,
      })
      return { executionId: skipped.executionId }
    }

    this.running.add(trigger.triggerId)
    try {
      return await this.executor.runTrigger(latest, options)
    } finally {
      this.running.delete(trigger.triggerId)
    }
  }
}

let singleton: CronManager | null = null

export function getCronManager(): CronManager {
  if (!singleton) singleton = new CronManager()
  return singleton
}
