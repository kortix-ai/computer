import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CronManager } from '../../src/services/cron-manager'
import { CronStore } from '../../src/services/cron-store'

async function waitFor<T>(fn: () => T | Promise<T>, predicate: (value: T) => boolean, timeoutMs: number = 1500): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await fn()
    if (predicate(value)) return value
    await Bun.sleep(25)
  }
  throw new Error('Timed out waiting for condition')
}

describe('CronManager', () => {
  let tempDir: string
  let manager: CronManager
  let store: CronStore
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cron-manager-test-'))
    store = new CronStore(join(tempDir, 'cron.db'))
    manager = new CronManager(store)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    manager.stop()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates, updates, pauses, and resumes triggers', () => {
    const trigger = manager.createTrigger({
      name: 'daily-report',
      cron_expr: '0 */5 * * * *',
      prompt: 'Generate report',
      timezone: 'UTC',
    })

    expect(trigger.name).toBe('daily-report')
    expect(trigger.isActive).toBe(true)
    expect(trigger.nextRunAt).toBeTruthy()

    const updated = manager.updateTrigger(trigger.triggerId, {
      name: 'daily-report-updated',
      cron_expr: '0 0 * * * *',
      is_active: false,
    })

    expect(updated?.name).toBe('daily-report-updated')
    expect(updated?.isActive).toBe(false)
    expect(updated?.nextRunAt).toBeNull()

    const resumed = manager.resumeTrigger(trigger.triggerId)
    expect(resumed?.isActive).toBe(true)
    expect(resumed?.nextRunAt).toBeTruthy()
  })

  it('runs a trigger manually and records a completed execution', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/session')) {
        return new Response(JSON.stringify({ id: 'session-123' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/session/session-123/prompt_async')) {
        expect(init?.method).toBe('POST')
        return new Response('', { status: 204 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const trigger = manager.createTrigger({
      name: 'manual-run',
      cron_expr: '0 */5 * * * *',
      prompt: 'Run now',
      timezone: 'UTC',
    })

    const result = await manager.runTrigger(trigger.triggerId, { manual: true })
    expect(result?.executionId).toBeTruthy()

    const execution = await waitFor(
      () => manager.getExecution(result!.executionId),
      (value) => value?.status === 'completed',
    )

    expect(execution?.sessionId).toBe('session-123')
    expect(execution?.metadata.response).toEqual({ accepted: true })
  })

  it('stores the created session id for reuse-mode triggers', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/session')) {
        return new Response(JSON.stringify({ id: 'reuse-session' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/session/reuse-session/prompt_async')) {
        return new Response('', { status: 204 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const trigger = manager.createTrigger({
      name: 'reuse-trigger',
      cron_expr: '0 */5 * * * *',
      prompt: 'Reuse session',
      session_mode: 'reuse',
    })

    const result = await manager.runTrigger(trigger.triggerId, { manual: true })
    await waitFor(() => manager.getExecution(result!.executionId), (value) => value?.status === 'completed')

    const updated = manager.getTrigger(trigger.triggerId)
    expect(updated?.sessionId).toBe('reuse-session')
  })
})
