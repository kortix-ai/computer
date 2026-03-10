import { mkdirSync } from 'node:fs'
import path from 'path'
import { CronManager as EmbeddedCronManager, CronStore, dispatchCronTriggerViaHttp, type CronExecutionRecord, type CronTriggerRecord } from '@kortix/opencode-agent-triggers'
import { config } from '../config'

export type SessionMode = 'new' | 'reuse'
export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'skipped'

export interface TriggerRecord {
  triggerId: string
  name: string
  description: string | null
  cronExpr: string
  timezone: string
  agentName: string | null
  modelProviderId: string | null
  modelId: string | null
  prompt: string
  sessionMode: SessionMode
  sessionId: string | null
  isActive: boolean
  maxRetries: number
  timeoutMs: number
  metadata: Record<string, unknown>
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ExecutionRecord {
  executionId: string
  triggerId: string
  status: ExecutionStatus
  sessionId: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  errorMessage: string | null
  retryCount: number
  metadata: Record<string, unknown>
  createdAt: string
}

export interface CreateTriggerInput {
  name: string
  description?: string
  cron_expr: string
  timezone?: string
  agent_name?: string
  model_provider_id?: string
  model_id?: string
  prompt: string
  session_mode?: SessionMode
  session_id?: string
  max_retries?: number
  timeout_ms?: number
  metadata?: Record<string, unknown>
}

export interface UpdateTriggerInput {
  name?: string
  description?: string | null
  cron_expr?: string
  timezone?: string
  agent_name?: string | null
  model_provider_id?: string | null
  model_id?: string | null
  prompt?: string
  session_mode?: SessionMode
  session_id?: string | null
  is_active?: boolean
  max_retries?: number
  timeout_ms?: number
  metadata?: Record<string, unknown>
}

function mapTrigger(trigger: CronTriggerRecord): TriggerRecord {
  const now = new Date().toISOString()
  return {
    triggerId: String(trigger.id),
    name: trigger.name,
    description: null,
    cronExpr: trigger.cron_expr,
    timezone: trigger.timezone ?? 'UTC',
    agentName: trigger.agent_name ?? null,
    modelProviderId: trigger.model_id ? (trigger.model_id.includes('/') ? trigger.model_id.split('/')[0] : 'kortix') : null,
    modelId: trigger.model_id ?? null,
    prompt: trigger.prompt,
    sessionMode: (trigger.session_mode as SessionMode | undefined) ?? 'new',
    sessionId: trigger.session_id ?? null,
    isActive: trigger.is_active ?? true,
    maxRetries: 0,
    timeoutMs: 300000,
    metadata: trigger.metadata ?? {},
    lastRunAt: trigger.last_run_at ?? null,
    nextRunAt: trigger.next_run_at ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

function mapExecution(execution: CronExecutionRecord): ExecutionRecord {
  return {
    executionId: execution.execution_id,
    triggerId: execution.trigger_id,
    status: execution.status,
    sessionId: execution.session_id ?? null,
    startedAt: execution.started_at,
    completedAt: execution.completed_at ?? null,
    durationMs: execution.duration_ms ?? null,
    errorMessage: execution.error_message ?? null,
    retryCount: execution.retry_count,
    metadata: execution.metadata,
    createdAt: execution.created_at,
  }
}

async function dispatchToOpenCode(trigger: CronTriggerRecord, event: { type: 'cron.tick'; manual: boolean; timestamp: string }) {
  return dispatchCronTriggerViaHttp(trigger, event, {
    baseUrl: `http://${config.OPENCODE_HOST}:${config.OPENCODE_PORT}`,
    timeoutMs: 300000,
  })
}

export class CronManager {
  private inner: EmbeddedCronManager

  constructor(store: CronStore = new CronStore(getCronStatePath())) {
    this.inner = new EmbeddedCronManager(store, dispatchToOpenCode)
  }

  start(): void {
    this.inner.start()
  }

  stop(): void {
    this.inner.stop()
  }

  listTriggers(active?: boolean): TriggerRecord[] {
    return this.inner.listTriggers(active).map(mapTrigger)
  }

  getTrigger(triggerId: string): TriggerRecord | null {
    const trigger = this.inner.getTrigger(triggerId)
    return trigger ? mapTrigger(trigger) : null
  }

  createTrigger(input: CreateTriggerInput): TriggerRecord {
    return mapTrigger(this.inner.createTrigger({
      name: input.name,
      cron_expr: input.cron_expr,
      prompt: input.prompt,
      timezone: input.timezone,
      agent_name: input.agent_name ?? null,
      model_id: input.model_id,
      session_mode: input.session_mode,
      session_id: input.session_id,
      is_active: true,
      metadata: input.metadata ?? {},
    }))
  }

  updateTrigger(triggerId: string, input: UpdateTriggerInput): TriggerRecord | null {
    const trigger = this.inner.updateTrigger(triggerId, {
      name: input.name,
      cron_expr: input.cron_expr,
      prompt: input.prompt,
      timezone: input.timezone,
      agent_name: input.agent_name ?? undefined,
      model_id: input.model_id ?? undefined,
      session_mode: input.session_mode,
      session_id: input.session_id ?? undefined,
      is_active: input.is_active,
      metadata: input.metadata,
    })
    return trigger ? mapTrigger(trigger) : null
  }

  deleteTrigger(triggerId: string): boolean {
    return this.inner.deleteTrigger(triggerId)
  }

  pauseTrigger(triggerId: string): TriggerRecord | null {
    const trigger = this.inner.pauseTrigger(triggerId)
    return trigger ? mapTrigger(trigger) : null
  }

  resumeTrigger(triggerId: string): TriggerRecord | null {
    const trigger = this.inner.resumeTrigger(triggerId)
    return trigger ? mapTrigger(trigger) : null
  }

  async runTrigger(triggerId: string, options?: { manual?: boolean }): Promise<{ executionId: string } | null> {
    return this.inner.runTrigger(triggerId, options)
  }

  listExecutions(filters?: { status?: ExecutionStatus; triggerId?: string; limit?: number; offset?: number }) {
    const result = this.inner.listExecutions({ triggerId: filters?.triggerId, limit: filters?.limit, offset: filters?.offset })
    return { data: result.data.map(mapExecution), total: result.total }
  }

  getExecution(executionId: string) {
    const execution = this.inner.getExecution(executionId)
    return execution ? mapExecution(execution) : null
  }
}

let singleton: CronManager | null = null

function getCronStatePath(): string {
  const root = path.join('/workspace', '.local', 'share', 'opencode', 'storage', 'agent-triggers')
  mkdirSync(root, { recursive: true })
  return path.join(root, 'cron-state.json')
}

export function getCronManager(): CronManager {
  if (!singleton) singleton = new CronManager()
  return singleton
}
