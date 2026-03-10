import { Cron } from "croner"
import { CronStore } from "./cron-store.js"
import type { CronExecutionRecord, CronTriggerRecord } from "./types.js"

export interface CronDispatchResult {
  sessionId: string
  response?: Record<string, unknown>
}

type CronDispatcher = (trigger: CronTriggerRecord, event: { type: "cron.tick"; manual: boolean; timestamp: string }) => Promise<CronDispatchResult>

export class CronManager {
  private readonly jobs = new Map<string, Cron>()
  private readonly running = new Set<string>()

  constructor(private readonly store: CronStore, private readonly dispatch: CronDispatcher) {}

  start(): void {
    for (const trigger of this.store.listTriggers(true)) this.schedule(trigger)
  }

  stop(): void {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
    this.running.clear()
  }

  listTriggers(active?: boolean): CronTriggerRecord[] {
    return this.store.listTriggers(active)
  }

  getTrigger(triggerId: string): CronTriggerRecord | null {
    return this.store.getTrigger(triggerId)
  }

  createTrigger(input: Omit<CronTriggerRecord, "id" | "last_run_at" | "next_run_at" | "session_id">): CronTriggerRecord {
    const trigger = this.store.createTrigger(input)
    if (trigger.is_active ?? true) this.schedule(trigger)
    return trigger
  }

  updateTrigger(triggerId: string, patch: Partial<CronTriggerRecord>): CronTriggerRecord | null {
    const trigger = this.store.updateTrigger(triggerId, patch)
    if (!trigger) return null
    this.unschedule(trigger.id!)
    if (trigger.is_active ?? true) this.schedule(trigger)
    return trigger
  }

  deleteTrigger(triggerId: string): boolean {
    const trigger = this.getTrigger(triggerId)
    if (trigger?.id) this.unschedule(trigger.id)
    return this.store.deleteTrigger(triggerId)
  }

  pauseTrigger(triggerId: string): CronTriggerRecord | null {
    const trigger = this.getTrigger(triggerId)
    if (trigger?.id) this.unschedule(trigger.id)
    return this.store.updateTrigger(triggerId, { is_active: false })
  }

  resumeTrigger(triggerId: string): CronTriggerRecord | null {
    const trigger = this.store.updateTrigger(triggerId, { is_active: true })
    if (trigger?.id) this.schedule(trigger)
    return trigger
  }

  getExecution(executionId: string): CronExecutionRecord | null {
    return this.store.getExecution(executionId)
  }

  listExecutions(filter?: { triggerId?: string; limit?: number; offset?: number }): { data: CronExecutionRecord[]; total: number } {
    return this.store.listExecutions(filter)
  }

  async runTrigger(triggerId: string, options?: { manual?: boolean }): Promise<{ executionId: string } | null> {
    const trigger = this.getTrigger(triggerId)
    if (!trigger || !trigger.id) return null
    return this.invoke(trigger, options?.manual === true)
  }

  private schedule(trigger: CronTriggerRecord): void {
    if (!trigger.id) return
    this.unschedule(trigger.id)
    const job = new Cron(trigger.cron_expr, { timezone: trigger.timezone ?? "UTC" }, async () => {
      await this.invoke(trigger, false)
    })
    this.jobs.set(trigger.id, job)
  }

  private unschedule(triggerId: string): void {
    const job = this.jobs.get(triggerId)
    if (job) job.stop()
    this.jobs.delete(triggerId)
  }

  private async invoke(trigger: CronTriggerRecord, manual: boolean): Promise<{ executionId: string }> {
    if (!trigger.id) throw new Error("Trigger id missing")
    if (this.running.has(trigger.id)) {
      const skipped = this.store.createExecution(trigger.id, {
        status: "skipped",
        metadata: { reason: "already_running", manual },
      })
      this.store.updateExecution(skipped.execution_id, {
        completed_at: new Date().toISOString(),
        duration_ms: 0,
      })
      return { executionId: skipped.execution_id }
    }

    this.running.add(trigger.id)
    const execution = this.store.createExecution(trigger.id, { status: "running", metadata: { manual } })
    const started = Date.now()
    try {
      const result = await this.dispatch(trigger, { type: "cron.tick", manual, timestamp: new Date().toISOString() })
      this.store.markTriggerRun(trigger.id, trigger.session_mode === "reuse" ? result.sessionId : trigger.session_id ?? null)
      this.store.updateExecution(execution.execution_id, {
        status: "completed",
        session_id: result.sessionId,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        metadata: { ...execution.metadata, response: result.response ?? { accepted: true }, manual },
      })
    } catch (error) {
      this.store.updateExecution(execution.execution_id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        error_message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.running.delete(trigger.id)
    }
    return { executionId: execution.execution_id }
  }
}
