import { existsSync } from 'fs'

export interface CoreServiceSpec {
  id: string
  name: string
  run: string
  deps: string[]
  autoStart: boolean
  restart: 'always' | 'never'
  restartDelayMs?: number
}

export interface CoreSpec {
  version: string
  services: CoreServiceSpec[]
}

export interface CoreServiceState {
  id: string
  name: string
  status: 'starting' | 'running' | 'stopped' | 'failed'
  pid: number | null
  restarts: number
  lastError: string | null
  startedAt: string | null
  stoppedAt: string | null
}

interface ManagedProc {
  spec: CoreServiceSpec
  proc: Bun.Subprocess<any, any, any> | null
  state: CoreServiceState
  intentionallyStopped: boolean
}

const CORE_SPEC_PATH = '/opt/kortix/core/service-spec.json'
const LEGACY_S6_SERVICES = [
  'svc-opencode-serve',
  'svc-opencode-web',
  'svc-lss-sync',
  'svc-opencode-channels',
  'svc-agent-browser-viewer',
  'svc-presentation-viewer',
  'svc-static-web',
] as const

async function run(cmd: string): Promise<{ ok: boolean; output: string }> {
  try {
    const proc = Bun.spawn(['bash', '-lc', cmd], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: '/workspace' },
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    return { ok: code === 0, output: `${stdout}\n${stderr}`.trim() }
  } catch (e) {
    return { ok: false, output: String(e) }
  }
}

function sortServices(spec: CoreSpec): CoreServiceSpec[] {
  const byId = new Map(spec.services.map((s) => [s.id, s]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const out: CoreServiceSpec[] = []

  function visit(id: string): void {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`Cycle detected in core service graph at ${id}`)
    const service = byId.get(id)
    if (!service) throw new Error(`Service dependency not found: ${id}`)
    visiting.add(id)
    for (const dep of service.deps) visit(dep)
    visiting.delete(id)
    visited.add(id)
    out.push(service)
  }

  for (const service of spec.services) visit(service.id)
  return out
}

export class CoreSupervisor {
  private spec: CoreSpec | null = null
  private processes = new Map<string, ManagedProc>()
  private started = false
  private bootedLegacyS6Disabled = false

  private emptyState(spec: CoreServiceSpec): CoreServiceState {
    return {
      id: spec.id,
      name: spec.name,
      status: 'stopped',
      pid: null,
      restarts: 0,
      lastError: null,
      startedAt: null,
      stoppedAt: null,
    }
  }

  private async loadSpecFromDisk(): Promise<CoreSpec> {
    const file = Bun.file(CORE_SPEC_PATH)
    if (!await file.exists()) {
      throw new Error(`Core service spec not found: ${CORE_SPEC_PATH}`)
    }
    const raw = await file.json() as CoreSpec
    if (!raw || typeof raw.version !== 'string' || !Array.isArray(raw.services)) {
      throw new Error('Invalid core service spec format')
    }
    for (const s of raw.services) {
      if (!s.id || !s.name || !s.run) throw new Error('Invalid core service entry')
      if (!Array.isArray(s.deps)) s.deps = []
      if (!s.restart) s.restart = 'always'
    }
    sortServices(raw)
    return raw
  }

  private async disableLegacyS6Services(): Promise<void> {
    if (this.bootedLegacyS6Disabled) return
    for (const svc of LEGACY_S6_SERVICES) {
      await run(`sudo s6-svc -d /run/service/${svc} >/dev/null 2>&1 || true`)
    }
    this.bootedLegacyS6Disabled = true
  }

  private async spawnService(procRef: ManagedProc): Promise<void> {
    const { spec, state } = procRef
    if (!existsSync(spec.run)) {
      state.status = 'failed'
      state.lastError = `Run script missing: ${spec.run}`
      state.stoppedAt = new Date().toISOString()
      return
    }

    state.status = 'starting'
    state.lastError = null
    state.stoppedAt = null

    const proc = Bun.spawn(['sudo', 'bash', spec.run], {
      env: { ...process.env, HOME: '/workspace' },
      stdout: 'inherit',
      stderr: 'inherit',
    })

    procRef.proc = proc
    procRef.intentionallyStopped = false
    state.pid = proc.pid
    state.status = 'running'
    state.startedAt = new Date().toISOString()

    void (async () => {
      const exit = await proc.exited
      if (procRef.proc !== proc) return
      procRef.proc = null
      state.pid = null
      state.stoppedAt = new Date().toISOString()

      if (procRef.intentionallyStopped) {
        state.status = 'stopped'
        return
      }

      state.status = 'failed'
      state.lastError = `Exited with code ${exit}`

      if (!this.started || spec.restart !== 'always') return

      state.restarts += 1
      const delay = spec.restartDelayMs ?? 1500
      setTimeout(() => {
        if (!this.started) return
        void this.spawnService(procRef)
      }, delay)
    })()
  }

  async start(): Promise<void> {
    if (this.started) return
    await this.disableLegacyS6Services()
    this.spec = await this.loadSpecFromDisk()
    this.processes.clear()
    for (const service of this.spec.services) {
      this.processes.set(service.id, {
        spec: service,
        proc: null,
        state: this.emptyState(service),
        intentionallyStopped: false,
      })
    }

    this.started = true
    const ordered = sortServices(this.spec)
    for (const service of ordered) {
      if (!service.autoStart) continue
      await this.startService(service.id)
    }
  }

  async stop(): Promise<void> {
    this.started = false
    const ids = [...this.processes.keys()].reverse()
    for (const id of ids) {
      await this.stopService(id)
    }
  }

  async startService(id: string): Promise<{ ok: boolean; output: string }> {
    const item = this.processes.get(id)
    if (!item) return { ok: false, output: `Unknown service: ${id}` }

    for (const dep of item.spec.deps) {
      const depState = this.processes.get(dep)?.state
      if (!depState || depState.status !== 'running') {
        return { ok: false, output: `Dependency not running: ${dep}` }
      }
    }

    if (item.proc && item.state.status === 'running') return { ok: true, output: 'already running' }
    await this.spawnService(item)
    return { ok: item.state.status === 'running', output: item.state.status }
  }

  async stopService(id: string): Promise<{ ok: boolean; output: string }> {
    const item = this.processes.get(id)
    if (!item) return { ok: false, output: `Unknown service: ${id}` }
    if (!item.proc) {
      item.state.status = 'stopped'
      item.state.pid = null
      item.state.stoppedAt = new Date().toISOString()
      return { ok: true, output: 'already stopped' }
    }

    item.intentionallyStopped = true
    item.state.status = 'stopped'
    const proc = item.proc
    try {
      proc.kill('SIGTERM')
    } catch {}

    const exited = await Promise.race([
      proc.exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ])

    if (!exited) {
      try {
        proc.kill('SIGKILL')
      } catch {}
    }

    item.proc = null
    item.state.pid = null
    item.state.stoppedAt = new Date().toISOString()
    return { ok: true, output: exited ? 'stopped' : 'killed' }
  }

  async restartService(id: string): Promise<{ ok: boolean; output: string }> {
    const stop = await this.stopService(id)
    if (!stop.ok) return stop
    return this.startService(id)
  }

  async reconcileFromDisk(): Promise<{ ok: boolean; output: string }> {
    const oldSpec = this.spec
    const next = await this.loadSpecFromDisk()
    this.spec = next

    const oldIds = new Set(oldSpec?.services.map((s) => s.id) ?? [])
    const nextIds = new Set(next.services.map((s) => s.id))
    const ordered = sortServices(next)

    for (const id of oldIds) {
      if (!nextIds.has(id)) {
        await this.stopService(id)
        this.processes.delete(id)
      }
    }

    for (const service of next.services) {
      if (!this.processes.has(service.id)) {
        this.processes.set(service.id, {
          spec: service,
          proc: null,
          state: this.emptyState(service),
          intentionallyStopped: false,
        })
      } else {
        const existing = this.processes.get(service.id)!
        existing.spec = service
      }
    }

    for (const service of ordered) {
      const item = this.processes.get(service.id)!
      if (item.proc) {
        await this.restartService(service.id)
      } else if (service.autoStart) {
        const started = await this.startService(service.id)
        if (!started.ok) {
          return { ok: false, output: `Failed to start ${service.id}: ${started.output}` }
        }
      }
    }

    return { ok: true, output: `Reconciled ${next.services.length} services` }
  }

  getStatus() {
    return {
      running: this.started,
      specVersion: this.spec?.version ?? null,
      services: [...this.processes.values()].map((p) => ({ ...p.state })),
    }
  }
}

export const coreSupervisor = new CoreSupervisor()
