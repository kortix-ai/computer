import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { Database } from 'bun:sqlite'
import { Cron } from 'croner'

export type SessionMode = 'new' | 'reuse'
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'skipped'

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
  startedAt: string | null
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

type TriggerRow = {
  trigger_id: string
  name: string
  description: string | null
  cron_expr: string
  timezone: string
  agent_name: string | null
  model_provider_id: string | null
  model_id: string | null
  prompt: string
  session_mode: SessionMode
  session_id: string | null
  is_active: number
  max_retries: number
  timeout_ms: number
  metadata: string | null
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

type ExecutionRow = {
  execution_id: string
  trigger_id: string
  status: ExecutionStatus
  session_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  error_message: string | null
  retry_count: number
  metadata: string | null
  created_at: string
}

const DEFAULT_DB_PATH = '/workspace/.cache/opencode/kortix/cron.db'

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {}
  return {}
}

function mapTrigger(row: TriggerRow): TriggerRecord {
  return {
    triggerId: row.trigger_id,
    name: row.name,
    description: row.description,
    cronExpr: row.cron_expr,
    timezone: row.timezone,
    agentName: row.agent_name,
    modelProviderId: row.model_provider_id,
    modelId: row.model_id,
    prompt: row.prompt,
    sessionMode: row.session_mode,
    sessionId: row.session_id,
    isActive: row.is_active === 1,
    maxRetries: row.max_retries,
    timeoutMs: row.timeout_ms,
    metadata: parseJsonObject(row.metadata),
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapExecution(row: ExecutionRow): ExecutionRecord {
  return {
    executionId: row.execution_id,
    triggerId: row.trigger_id,
    status: row.status,
    sessionId: row.session_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    metadata: parseJsonObject(row.metadata),
    createdAt: row.created_at,
  }
}

export function isValidCronExpression(expr: string): boolean {
  try {
    new Cron(expr)
    return true
  } catch {
    return false
  }
}

export function getNextRun(expr: string, timezone: string = 'UTC'): Date | null {
  try {
    const cron = new Cron(expr, { timezone })
    return cron.nextRun() ?? null
  } catch {
    return null
  }
}

export function describeCron(expr: string): string {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 6) return expr

    const [sec, min, hour, day, month, weekday] = parts
    if (sec.startsWith('*/') && min === '*' && hour === '*') return `Every ${sec.slice(2)} seconds`
    if (sec === '0' && min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} minutes`
    if (sec === '0' && min === '0' && hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`
    if (sec === '0' && !min.includes('*') && !hour.includes('*') && day === '*' && month === '*' && weekday === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    }
    return expr
  } catch {
    return expr
  }
}

export class CronStore {
  private db: Database

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath, { create: true, strict: true })
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA busy_timeout = 5000;')
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS triggers (
        trigger_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        cron_expr TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        agent_name TEXT,
        model_provider_id TEXT,
        model_id TEXT,
        prompt TEXT NOT NULL,
        session_mode TEXT NOT NULL DEFAULT 'new',
        session_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        max_retries INTEGER NOT NULL DEFAULT 0,
        timeout_ms INTEGER NOT NULL DEFAULT 300000,
        metadata TEXT NOT NULL DEFAULT '{}',
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_triggers_active ON triggers(is_active);
      CREATE INDEX IF NOT EXISTS idx_triggers_next_run ON triggers(next_run_at);

      CREATE TABLE IF NOT EXISTS executions (
        execution_id TEXT PRIMARY KEY,
        trigger_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        session_id TEXT,
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(trigger_id) REFERENCES triggers(trigger_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_executions_trigger ON executions(trigger_id);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(created_at);
    `)
  }

  close(): void {
    this.db.close(false)
  }

  listTriggers(filters?: { active?: boolean }): TriggerRecord[] {
    if (filters?.active === undefined) {
      return this.db.query<TriggerRow, []>('SELECT * FROM triggers ORDER BY created_at DESC').all().map(mapTrigger)
    }
    return this.db
      .query<TriggerRow, [number]>('SELECT * FROM triggers WHERE is_active = ? ORDER BY created_at DESC')
      .all(filters.active ? 1 : 0)
      .map(mapTrigger)
  }

  getTrigger(triggerId: string): TriggerRecord | null {
    const row = this.db.query<TriggerRow, [string]>('SELECT * FROM triggers WHERE trigger_id = ?').get(triggerId)
    return row ? mapTrigger(row) : null
  }

  createTrigger(input: CreateTriggerInput): TriggerRecord {
    const now = new Date().toISOString()
    const nextRun = getNextRun(input.cron_expr, input.timezone ?? 'UTC')
    const triggerId = crypto.randomUUID()

    this.db
      .prepare(`
        INSERT INTO triggers (
          trigger_id, name, description, cron_expr, timezone, agent_name,
          model_provider_id, model_id, prompt, session_mode, session_id,
          is_active, max_retries, timeout_ms, metadata, next_run_at, created_at, updated_at
        ) VALUES (
          $trigger_id, $name, $description, $cron_expr, $timezone, $agent_name,
          $model_provider_id, $model_id, $prompt, $session_mode, $session_id,
          1, $max_retries, $timeout_ms, $metadata, $next_run_at, $created_at, $updated_at
        )
      `)
      .run({
        trigger_id: triggerId,
        name: input.name,
        description: input.description ?? null,
        cron_expr: input.cron_expr,
        timezone: input.timezone ?? 'UTC',
        agent_name: input.agent_name ?? null,
        model_provider_id: input.model_provider_id ?? null,
        model_id: input.model_id ?? null,
        prompt: input.prompt,
        session_mode: input.session_mode ?? 'new',
        session_id: input.session_id ?? null,
        max_retries: input.max_retries ?? 0,
        timeout_ms: input.timeout_ms ?? 300000,
        metadata: JSON.stringify(input.metadata ?? {}),
        next_run_at: nextRun?.toISOString() ?? null,
        created_at: now,
        updated_at: now,
      })

    return this.getTrigger(triggerId)!
  }

  updateTrigger(triggerId: string, input: UpdateTriggerInput): TriggerRecord | null {
    const current = this.getTrigger(triggerId)
    if (!current) return null

    const cronExpr = input.cron_expr ?? current.cronExpr
    const timezone = input.timezone ?? current.timezone
    const isActive = input.is_active ?? current.isActive
    const nextRun = isActive ? getNextRun(cronExpr, timezone) : null
    const updatedAt = new Date().toISOString()

    this.db
      .prepare(`
        UPDATE triggers
        SET
          name = $name,
          description = $description,
          cron_expr = $cron_expr,
          timezone = $timezone,
          agent_name = $agent_name,
          model_provider_id = $model_provider_id,
          model_id = $model_id,
          prompt = $prompt,
          session_mode = $session_mode,
          session_id = $session_id,
          is_active = $is_active,
          max_retries = $max_retries,
          timeout_ms = $timeout_ms,
          metadata = $metadata,
          next_run_at = $next_run_at,
          updated_at = $updated_at
        WHERE trigger_id = $trigger_id
      `)
      .run({
        trigger_id: triggerId,
        name: input.name ?? current.name,
        description: input.description === undefined ? current.description : input.description,
        cron_expr: cronExpr,
        timezone: timezone,
        agent_name: input.agent_name === undefined ? current.agentName : input.agent_name,
        model_provider_id: input.model_provider_id === undefined ? current.modelProviderId : input.model_provider_id,
        model_id: input.model_id === undefined ? current.modelId : input.model_id,
        prompt: input.prompt ?? current.prompt,
        session_mode: input.session_mode ?? current.sessionMode,
        session_id: input.session_id === undefined ? current.sessionId : input.session_id,
        is_active: isActive ? 1 : 0,
        max_retries: input.max_retries ?? current.maxRetries,
        timeout_ms: input.timeout_ms ?? current.timeoutMs,
        metadata: JSON.stringify(input.metadata ?? current.metadata),
        next_run_at: nextRun?.toISOString() ?? null,
        updated_at: updatedAt,
      })

    return this.getTrigger(triggerId)
  }

  deleteTrigger(triggerId: string): boolean {
    const result = this.db.prepare('DELETE FROM triggers WHERE trigger_id = ?').run(triggerId)
    return result.changes > 0
  }

  setTriggerActive(triggerId: string, isActive: boolean): TriggerRecord | null {
    const current = this.getTrigger(triggerId)
    if (!current) return null
    const nextRun = isActive ? getNextRun(current.cronExpr, current.timezone) : null
    const updatedAt = new Date().toISOString()

    this.db
      .prepare('UPDATE triggers SET is_active = ?, next_run_at = ?, updated_at = ? WHERE trigger_id = ?')
      .run(isActive ? 1 : 0, nextRun?.toISOString() ?? null, updatedAt, triggerId)

    return this.getTrigger(triggerId)
  }

  markTriggerRun(triggerId: string, when: Date, nextRun: Date | null): void {
    this.db
      .prepare('UPDATE triggers SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE trigger_id = ?')
      .run(when.toISOString(), nextRun?.toISOString() ?? null, when.toISOString(), triggerId)
  }

  updateTriggerSession(triggerId: string, sessionId: string): void {
    this.db
      .prepare('UPDATE triggers SET session_id = ?, updated_at = ? WHERE trigger_id = ?')
      .run(sessionId, new Date().toISOString(), triggerId)
  }

  createExecution(triggerId: string, input?: { status?: ExecutionStatus; retryCount?: number; metadata?: Record<string, unknown> }): ExecutionRecord {
    const executionId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    this.db
      .prepare(`
        INSERT INTO executions (execution_id, trigger_id, status, started_at, retry_count, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        executionId,
        triggerId,
        input?.status ?? 'running',
        createdAt,
        input?.retryCount ?? 0,
        JSON.stringify(input?.metadata ?? {}),
        createdAt,
      )
    return this.getExecution(executionId)!
  }

  getExecution(executionId: string): ExecutionRecord | null {
    const row = this.db.query<ExecutionRow, [string]>('SELECT * FROM executions WHERE execution_id = ?').get(executionId)
    return row ? mapExecution(row) : null
  }

  updateExecution(executionId: string, input: {
    status: ExecutionStatus
    sessionId?: string | null
    completedAt?: string | null
    durationMs?: number | null
    errorMessage?: string | null
    retryCount?: number
    metadata?: Record<string, unknown>
  }): void {
    const current = this.getExecution(executionId)
    if (!current) return
    this.db
      .prepare(`
        UPDATE executions
        SET status = $status,
            session_id = $session_id,
            completed_at = $completed_at,
            duration_ms = $duration_ms,
            error_message = $error_message,
            retry_count = $retry_count,
            metadata = $metadata
        WHERE execution_id = $execution_id
      `)
      .run({
        execution_id: executionId,
        status: input.status,
        session_id: input.sessionId === undefined ? current.sessionId : input.sessionId,
        completed_at: input.completedAt === undefined ? current.completedAt : input.completedAt,
        duration_ms: input.durationMs === undefined ? current.durationMs : input.durationMs,
        error_message: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
        retry_count: input.retryCount ?? current.retryCount,
        metadata: JSON.stringify(input.metadata ?? current.metadata),
      })
  }

  listExecutions(filters?: { status?: ExecutionStatus; triggerId?: string; limit?: number; offset?: number }): { data: ExecutionRecord[]; total: number } {
    const conditions: string[] = []
    const params: Array<string | number> = []
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.triggerId) {
      conditions.push('trigger_id = ?')
      params.push(filters.triggerId)
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const totalRow = this.db
      .query<{ count: number }, Array<string | number>>(`SELECT count(*) as count FROM executions${where}`)
      .get(...params)
    const total = totalRow?.count ?? 0

    const limit = Math.min(filters?.limit ?? 50, 200)
    const offset = filters?.offset ?? 0
    const rows = this.db
      .query<ExecutionRow, Array<string | number>>(`SELECT * FROM executions${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)

    return { data: rows.map(mapExecution), total }
  }
}
