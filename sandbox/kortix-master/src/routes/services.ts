import { Hono } from 'hono'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { deployer } from './deploy'
import type { ListeningProcess } from '../services/port-scanner'

const servicesRouter = new Hono()
console.log('[Services] Route module loaded')

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceEntry {
  /** Unique service identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Port the service is listening on */
  port: number
  /** Process ID */
  pid: number
  /** Detected framework (nextjs, vite, python, static, node, go, etc.) */
  framework: string
  /** Source directory path */
  sourcePath: string
  /** ISO timestamp when the service started */
  startedAt: string
  /** Current status */
  status: 'running' | 'stopped'
  /** Whether this service is managed by the deployer (vs manually started) */
  managed: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Guess a framework label from the process command/cmdline/cwd.
 * For compiled binaries (Go, Rust, etc.), falls back to filesystem detection.
 */
function guessFramework(command: string, cmdline: string, cwd?: string): string {
  const cmd = command.toLowerCase()
  const args = cmdline.toLowerCase()

  // ── Direct command/args detection ──
  if (cmd === 'go' || cmd.startsWith('go-') || args.includes('go run') || args.includes('go build')) return 'go'
  if (cmd === 'python' || cmd === 'python3' || cmd === 'uvicorn' || cmd === 'gunicorn') return 'python'
  if (cmd === 'ruby' || cmd === 'rails' || cmd === 'puma') return 'ruby'
  if (cmd === 'java' || cmd === 'javac') return 'java'
  if (cmd === 'rust' || cmd === 'cargo') return 'rust'
  if (args.includes('next')) return 'nextjs'
  if (args.includes('vite')) return 'vite'
  if (args.includes('react-scripts')) return 'cra'
  if (args.includes('express') || args.includes('fastify') || args.includes('hono')) return 'node'
  if (args.includes('serve ') || args.includes('http-server')) return 'static'
  if (cmd === 'node' || cmd === 'bun' || cmd === 'deno') return 'node'

  // ── Compiled binary detection via filesystem ──
  // For compiled Go/Rust/etc. binaries, check the CWD or binary parent dir for project markers.
  if (cwd && cwd.startsWith('/workspace')) {
    // Check CWD first, then walk up to /workspace
    const dirsToCheck = [cwd]
    // Also check the directory the binary lives in (cmdline first arg)
    const binaryPath = cmdline.split(/\s+/)[0]
    if (binaryPath) {
      const binDir = binaryPath.replace(/\/[^/]+$/, '')
      if (binDir && binDir !== cwd && binDir.startsWith('/workspace')) {
        dirsToCheck.push(binDir)
      }
    }

    for (const dir of dirsToCheck) {
      try {
        if (existsSync(join(dir, 'go.mod'))) return 'go'
        if (existsSync(join(dir, 'Cargo.toml'))) return 'rust'
        if (existsSync(join(dir, 'Gemfile'))) return 'ruby'
        if (existsSync(join(dir, 'pom.xml')) || existsSync(join(dir, 'build.gradle'))) return 'java'
        if (existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'pyproject.toml'))) return 'python'
        if (existsSync(join(dir, 'package.json'))) return 'node'
      } catch { /* permission denied or similar */ }
    }
  }

  return 'unknown'
}

/**
 * Guess a human-friendly name from the process info.
 */
function guessName(command: string, cmdline: string, cwd: string, port: number): string {
  // Use the directory name from cwd if it's inside /workspace
  if (cwd && cwd !== '/' && cwd !== '/workspace') {
    const relative = cwd.replace(/^\/workspace\/?/, '')
    const dirName = relative.split('/').filter(Boolean).pop()
    if (dirName) {
      return dirName
    }
  }

  // Try to extract from the binary path in cmdline
  const binaryPath = cmdline.split(/\s+/)[0]
  if (binaryPath && binaryPath.startsWith('/workspace/')) {
    const relative = binaryPath.replace(/^\/workspace\/?/, '')
    const parts = relative.split('/').filter(Boolean)
    // Use the directory name if it's a nested binary (e.g. /workspace/go-server/server)
    if (parts.length > 1) {
      return parts[0]
    }
  }

  // Try to extract a meaningful name from cmdline
  // e.g. "go run main.go" → "go-app", "python app.py" → "app"
  const cmd = command.toLowerCase()
  if (cmd === 'go' || cmdline.includes('go run') || cmdline.includes('go build')) {
    // Try to get script/binary name
    const goMatch = cmdline.match(/go\s+run\s+(\S+)/)
    if (goMatch) {
      const file = goMatch[1].replace(/\.\w+$/, '') // strip extension
      if (file !== 'main' && file !== '.') return file
    }
  }
  if (cmd === 'python' || cmd === 'python3') {
    const pyMatch = cmdline.match(/python3?\s+(\S+)/)
    if (pyMatch) {
      const file = pyMatch[1].replace(/\.\w+$/, '')
      if (file && file !== '-m') return file
    }
  }

  // Fallback: command name if it's not super generic
  if (command && !['node', 'python3', 'python', 'sh', 'bash', 'bun'].includes(cmd)) {
    return command
  }

  return `service:${port}`
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET / — List all running services.
 *
 * Merges two sources:
 * 1. Deployer-tracked services (managed — started via POST /kortix/deploy)
 * 2. Port-scanned processes (unmanaged — started manually in terminals)
 *
 * Deployer entries take priority when both exist for the same port.
 */
servicesRouter.get('/', async (c) => {
  try {
    const results: ServiceEntry[] = []
    const seenPorts = new Set<number>()

    // 1. Deployer-tracked services (managed)
    const deployments = deployer.listDeployments()
    console.log(`[Services API] Deployer has ${deployments.length} tracked service(s)`)
    for (const dep of deployments) {
      seenPorts.add(dep.port)
      results.push({
        id: dep.deploymentId,
        name: dep.deploymentId,
        port: dep.port,
        pid: dep.pid,
        framework: dep.framework,
        sourcePath: dep.sourcePath,
        startedAt: dep.startedAt instanceof Date ? dep.startedAt.toISOString() : String(dep.startedAt),
        status: dep.status,
        managed: true,
      })
    }

    // 2. Port-scanned processes (unmanaged)
    let scanned: ListeningProcess[] = []
    try {
      const { scanListeningProcesses } = await import('../services/port-scanner')
      scanned = scanListeningProcesses()
      console.log(`[Services API] Port scanner found ${scanned.length} listening process(es):`, scanned.map(p => `${p.command}:${p.port} (pid=${p.pid}, cwd=${p.cwd})`))
    } catch (err) {
      console.warn(`[Services API] Port scanner failed (non-fatal):`, err)
    }
    for (const proc of scanned) {
      if (seenPorts.has(proc.port)) continue
      seenPorts.add(proc.port)

      results.push({
        id: `port-${proc.port}`,
        name: guessName(proc.command, proc.cmdline, proc.cwd, proc.port),
        port: proc.port,
        pid: proc.pid,
        framework: guessFramework(proc.command, proc.cmdline, proc.cwd),
        sourcePath: proc.cwd,
        startedAt: '', // Not available from /proc
        status: 'running',
        managed: false,
      })
    }

    return c.json({ services: results })
  } catch (error) {
    console.error('[Services API] Error listing services:', error)
    return c.json({ error: 'Failed to list services', details: String(error) }, 500)
  }
})

/**
 * GET /:id — Get a specific service's details.
 */
servicesRouter.get('/:id', (c) => {
  try {
    const id = c.req.param('id')
    const status = deployer.getStatus(id)

    if (status.status === 'not_found') {
      return c.json({ error: `Service not found: ${id}` }, 404)
    }

    const service: ServiceEntry = {
      id,
      name: id,
      port: status.port ?? 0,
      pid: status.pid ?? 0,
      framework: status.framework ?? 'unknown',
      sourcePath: '',
      startedAt: status.startedAt instanceof Date ? status.startedAt.toISOString() : '',
      status: status.status,
      managed: true,
    }

    return c.json({ service })
  } catch (error) {
    console.error('[Services API] Error getting service:', error)
    return c.json({ error: 'Failed to get service', details: String(error) }, 500)
  }
})

/**
 * POST /:id/stop — Stop a running service.
 * Only works for deployer-managed services.
 */
servicesRouter.post('/:id/stop', (c) => {
  try {
    const id = c.req.param('id')
    const result = deployer.stop(id)

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 404)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('[Services API] Error stopping service:', error)
    return c.json({ error: 'Failed to stop service', details: String(error) }, 500)
  }
})

export default servicesRouter
