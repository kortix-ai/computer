import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Cron } from "croner"
import type { CronExecutionRecord, CronExecutionStatus, CronTriggerRecord } from "./types.js"

interface PersistedCronState {
  triggers: CronTriggerRecord[]
  executions: CronExecutionRecord[]
}

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function isValidCronExpression(expr: string): boolean {
  try {
    new Cron(expr)
    return true
  } catch {
    return false
  }
}

export function getNextRun(expr: string, timezone = "UTC"): Date | null {
  try {
    return new Cron(expr, { timezone }).nextRun() ?? null
  } catch {
    return null
  }
}

export function describeCron(expr: string): string {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 6) return expr
    const [sec, min, hour, day, month, weekday] = parts
    if (sec.startsWith("*/") && min === "*" && hour === "*") return `Every ${sec.slice(2)} seconds`
    if (sec === "0" && min.startsWith("*/") && hour === "*") return `Every ${min.slice(2)} minutes`
    if (sec === "0" && min === "0" && hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`
    if (sec === "0" && !min.includes("*") && !hour.includes("*") && day === "*" && month === "*" && weekday === "*") {
      return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`
    }
    return expr
  } catch {
    return expr
  }
}

export class CronStore {
  private state: PersistedCronState

  constructor(private readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true })
    this.state = existsSync(filePath) ? this.readFromDisk() : { triggers: [], executions: [] }
    this.write()
  }

  private readFromDisk(): PersistedCronState {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedCronState
      return {
        triggers: Array.isArray(raw.triggers) ? raw.triggers : [],
        executions: Array.isArray(raw.executions) ? raw.executions : [],
      }
    } catch {
      return { triggers: [], executions: [] }
    }
  }

  private write(): void {
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8")
  }

  listTriggers(active?: boolean): CronTriggerRecord[] {
    const items = active === undefined ? this.state.triggers : this.state.triggers.filter((trigger) => (trigger.is_active ?? true) === active)
    return items.sort((a, b) => (b.id ?? "").localeCompare(a.id ?? ""))
  }

  getTrigger(triggerId: string): CronTriggerRecord | null {
    return this.state.triggers.find((trigger) => trigger.id === triggerId || trigger.name === triggerId) ?? null
  }

  createTrigger(input: Omit<CronTriggerRecord, "id" | "last_run_at" | "next_run_at" | "session_id">): CronTriggerRecord {
    const trigger: CronTriggerRecord = {
      ...input,
      id: crypto.randomUUID(),
      is_active: input.is_active ?? true,
      session_id: null,
      last_run_at: null,
      next_run_at: getNextRun(input.cron_expr, input.timezone ?? "UTC")?.toISOString() ?? null,
      metadata: ensureObject(input.metadata),
    }
    this.state.triggers.push(trigger)
    this.write()
    return trigger
  }

  updateTrigger(triggerId: string, patch: Partial<CronTriggerRecord>): CronTriggerRecord | null {
    const index = this.state.triggers.findIndex((trigger) => trigger.id === triggerId || trigger.name === triggerId)
    if (index < 0) return null
    const current = this.state.triggers[index]
    const next: CronTriggerRecord = {
      ...current,
      ...patch,
      id: current.id,
      metadata: patch.metadata ? ensureObject(patch.metadata) : current.metadata,
    }
    next.next_run_at = (next.is_active ?? true)
      ? getNextRun(next.cron_expr, next.timezone ?? "UTC")?.toISOString() ?? null
      : null
    this.state.triggers[index] = next
    this.write()
    return this.state.triggers[index]
  }

  deleteTrigger(triggerId: string): boolean {
    const nextTriggers = this.state.triggers.filter((trigger) => trigger.id !== triggerId && trigger.name !== triggerId)
    if (nextTriggers.length === this.state.triggers.length) return false
    this.state.triggers = nextTriggers
    this.state.executions = this.state.executions.filter((execution) => execution.trigger_id !== triggerId)
    this.write()
    return true
  }

  createExecution(triggerId: string, input?: { status?: CronExecutionStatus; retry_count?: number; metadata?: Record<string, unknown> }): CronExecutionRecord {
    const startedAt = new Date().toISOString()
    const execution: CronExecutionRecord = {
      execution_id: crypto.randomUUID(),
      trigger_id: triggerId,
      status: input?.status ?? "running",
      retry_count: input?.retry_count ?? 0,
      metadata: ensureObject(input?.metadata),
      created_at: startedAt,
      started_at: startedAt,
      completed_at: null,
      duration_ms: null,
      session_id: null,
      error_message: null,
    }
    this.state.executions.push(execution)
    this.write()
    return execution
  }

  updateExecution(executionId: string, patch: Partial<CronExecutionRecord>): CronExecutionRecord | null {
    const index = this.state.executions.findIndex((execution) => execution.execution_id === executionId)
    if (index < 0) return null
    this.state.executions[index] = { ...this.state.executions[index], ...patch, execution_id: this.state.executions[index].execution_id }
    this.write()
    return this.state.executions[index]
  }

  getExecution(executionId: string): CronExecutionRecord | null {
    return this.state.executions.find((execution) => execution.execution_id === executionId) ?? null
  }

  listExecutions(filter?: { triggerId?: string; limit?: number; offset?: number }): { data: CronExecutionRecord[]; total: number } {
    let items = filter?.triggerId ? this.state.executions.filter((execution) => execution.trigger_id === filter.triggerId) : this.state.executions
    items = items.sort((a, b) => b.created_at.localeCompare(a.created_at))
    const total = items.length
    const offset = filter?.offset ?? 0
    const limit = filter?.limit ?? 50
    return { data: items.slice(offset, offset + limit), total }
  }

  markTriggerRun(triggerId: string, sessionId?: string | null): CronTriggerRecord | null {
    return this.updateTrigger(triggerId, {
      last_run_at: new Date().toISOString(),
      next_run_at: this.getTrigger(triggerId)
        ? getNextRun(this.getTrigger(triggerId)!.cron_expr, this.getTrigger(triggerId)!.timezone ?? "UTC")?.toISOString() ?? null
        : null,
      session_id: sessionId === undefined ? this.getTrigger(triggerId)?.session_id ?? null : sessionId,
    })
  }
}
