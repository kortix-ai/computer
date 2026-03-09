import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeploymentConfig {
  deploymentId: string
  sourceType: 'git' | 'code' | 'files' | 'tar'
  sourceRef?: string       // git URL or branch
  sourcePath: string       // path on filesystem, default /workspace
  framework?: string       // auto-detect if not provided
  envVarKeys?: string[]    // env var names to pass to the app
  buildConfig?: Record<string, unknown>
  entrypoint?: string      // custom start command
}

export interface DeploymentResult {
  success: boolean
  port?: number
  pid?: number
  framework: string
  error?: string
  logs: string[]
  buildDuration?: number
  startDuration?: number
}

export interface RunningDeployment {
  deploymentId: string
  port: number
  pid: number
  process: ReturnType<typeof Bun.spawn>
  framework: string
  sourcePath: string
  startedAt: Date
  logs: string[]
  startCmd: string                    // stored for auto-restart
  startEnv: Record<string, string>    // stored for auto-restart
}

interface FrameworkCommands {
  install: string | null
  build: string | null
  start: string
  defaultPort: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INSTALL_TIMEOUT_MS = 120_000  // 2 min for install
const BUILD_TIMEOUT_MS   = 120_000  // 2 min for build
const START_WAIT_MS      = 15_000   // 15 s for port to accept connections
const PORT_MIN           = 10_000
const PORT_MAX           = 60_000

// Auto-restart settings
const MAX_RESTARTS       = 5        // max consecutive restarts before giving up
const STABLE_RUNTIME_MS  = 60_000   // if process ran >60s, reset restart counter
const BASE_RESTART_DELAY = 1_000    // initial backoff delay (doubles each retry)
const MAX_RESTART_DELAY  = 30_000   // cap backoff at 30s

// ECONNRESET guard — injected into NODE_OPTIONS for all deployed processes
const ECONNRESET_GUARD_PATH = '/opt/kortix-master/econnreset-guard.cjs'

/**
 * Build NODE_OPTIONS value that includes the ECONNRESET guard.
 * Preserves any existing NODE_OPTIONS from the environment.
 */
function buildNodeOptions(): string {
  const existing = process.env.NODE_OPTIONS || ''
  const guardRequire = `--require=${ECONNRESET_GUARD_PATH}`
  if (existing.includes(guardRequire)) return existing
  return `${existing} ${guardRequire}`.trim()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a shell command via Bun.spawn, capture combined stdout+stderr.
 */
async function run(
  cmd: string,
  cwd: string,
  env?: Record<string, string>,
  timeoutMs: number = 60_000,
): Promise<{ ok: boolean; output: string }> {
  const mergedEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...env,
    // Ensure non-interactive
    CI: '1',
    FORCE_COLOR: '0',
  }

  const proc = Bun.spawn(['sh', '-c', cmd], {
    cwd,
    env: mergedEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Set up a timeout that kills the process
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, timeoutMs)

  try {
    const [stdoutBuf, stderrBuf] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    clearTimeout(timer)

    const output = (stdoutBuf + '\n' + stderrBuf).trim()

    if (timedOut) {
      return { ok: false, output: output + `\n[TIMEOUT after ${timeoutMs}ms]` }
    }

    return { ok: exitCode === 0, output }
  } catch (err) {
    clearTimeout(timer)
    return { ok: false, output: String(err) }
  }
}

/**
 * Find a random available port in [PORT_MIN, PORT_MAX] by briefly listening.
 */
async function findAvailablePort(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN))
    const available = await testPortAvailable(port)
    if (available) return port
  }
  throw new Error('Could not find an available port after 50 attempts')
}

function testPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const server = Bun.serve({
        port,
        fetch() {
          return new Response('')
        },
      })
      // Port was available — close the server and return true
      server.stop(true)
      resolve(true)
    } catch {
      // Port in use
      resolve(false)
    }
  })
}

/**
 * Poll http://localhost:{port} every 500ms until it responds or timeout.
 */
async function waitForPort(port: number, timeoutMs: number = START_WAIT_MS): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(2000),
      })
      // Any response (even 404/500) means the server is listening
      void res
      return true
    } catch {
      // Not up yet
    }
    await Bun.sleep(500)
  }
  return false
}

// ---------------------------------------------------------------------------
// Deployer
// ---------------------------------------------------------------------------

export class Deployer {
  private runningDeployments = new Map<string, RunningDeployment>()

  // -----------------------------------------------------------------------
  // Framework detection
  // -----------------------------------------------------------------------

  detectFramework(sourcePath: string): string {
    const pkgPath = join(sourcePath, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        const allDeps: Record<string, string> = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        }

        if (allDeps['next']) return 'nextjs'
        if (allDeps['vite'] || Object.keys(allDeps).some((k) => k.startsWith('@vitejs'))) return 'vite'
        if (allDeps['react-scripts']) return 'cra'
        if (allDeps['express'] || allDeps['hono'] || allDeps['fastify'] || allDeps['koa']) return 'node'

        // Fallback: has a start script → treat as generic node
        if (pkg.scripts?.start) return 'node'
      } catch {
        // Bad JSON — fall through
      }
    }

    // Python
    if (existsSync(join(sourcePath, 'requirements.txt')) || existsSync(join(sourcePath, 'pyproject.toml'))) {
      return 'python'
    }

    // Static HTML
    if (existsSync(join(sourcePath, 'index.html'))) {
      return 'static'
    }

    return 'unknown'
  }

  // -----------------------------------------------------------------------
  // Framework commands
  // -----------------------------------------------------------------------

  getFrameworkCommands(
    framework: string,
    sourcePath: string,
    config: DeploymentConfig,
  ): FrameworkCommands {
    const entrypoint = config.entrypoint

    switch (framework) {
      case 'nextjs':
        return {
          install: 'npm install',
          build: 'npm run build',
          start: entrypoint || 'npm start',
          defaultPort: 3000,
        }

      case 'vite':
        return {
          install: 'npm install',
          build: 'npm run build',
          start: entrypoint || 'npx vite preview --host 0.0.0.0 --port __PORT__',
          defaultPort: 4173,
        }

      case 'cra':
        return {
          install: 'npm install',
          build: 'npm run build',
          start: entrypoint || 'npx serve -s build -l __PORT__',
          defaultPort: 3000,
        }

      case 'node':
        return {
          install: 'npm install',
          build: null,
          start: entrypoint || 'npm start',
          defaultPort: 3000,
        }

      case 'python': {
        const hasRequirements = existsSync(join(sourcePath, 'requirements.txt'))
        return {
          install: hasRequirements ? 'pip install -r requirements.txt' : null,
          build: null,
          start: entrypoint || 'python app.py',
          defaultPort: 8080,
        }
      }

      case 'static':
        return {
          install: null,
          build: null,
          start: entrypoint || 'npx serve -s . -l __PORT__',
          defaultPort: 3000,
        }

      default:
        return {
          install: null,
          build: null,
          start: entrypoint || 'npm start',
          defaultPort: 3000,
        }
    }
  }

  // -----------------------------------------------------------------------
  // Deploy
  // -----------------------------------------------------------------------

  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    const logs: string[] = []
    const log = (msg: string) => {
      logs.push(msg)
      console.log(`[Deployer:${config.deploymentId}] ${msg}`)
    }

    try {
      // 1. Validate source path
      const sourcePath = config.sourcePath || '/workspace'
      if (!existsSync(sourcePath)) {
        return { success: false, framework: 'unknown', error: `Source path not found: ${sourcePath}`, logs }
      }
      log(`Source path: ${sourcePath}`)

      // 2. Git clone/pull if needed
      if (config.sourceType === 'git' && config.sourceRef) {
        log(`Git source: ${config.sourceRef}`)
        if (existsSync(join(sourcePath, '.git'))) {
          log('Existing git repo — pulling latest...')
          const pull = await run(`git pull`, sourcePath, undefined, 60_000)
          log(pull.ok ? 'Git pull succeeded' : `Git pull failed: ${pull.output}`)
          logs.push(pull.output)
        } else {
          log('Cloning repo...')
          const clone = await run(
            `git clone ${config.sourceRef} .`,
            sourcePath,
            undefined,
            120_000,
          )
          if (!clone.ok) {
            return { success: false, framework: 'unknown', error: `Git clone failed`, logs: [...logs, clone.output] }
          }
          log('Git clone succeeded')
          logs.push(clone.output)
        }
      }

      // 3. Detect framework
      const framework = config.framework || this.detectFramework(sourcePath)
      log(`Framework: ${framework}`)

      // 4. Get commands
      const cmds = this.getFrameworkCommands(framework, sourcePath, config)

      // 5. Build environment — pass through requested env vars
      const appEnv: Record<string, string> = {}
      if (config.envVarKeys) {
        for (const key of config.envVarKeys) {
          if (process.env[key]) {
            appEnv[key] = process.env[key] as string
          }
        }
      }

      // 6. Install (skip if no package.json/requirements.txt for the install command)
      const shouldInstall = cmds.install && this.shouldRunInstall(cmds.install, sourcePath)
      if (shouldInstall && cmds.install) {
        log(`Installing: ${cmds.install}`)
        const installStart = Date.now()
        const installResult = await run(cmds.install, sourcePath, appEnv, INSTALL_TIMEOUT_MS)
        const installDuration = Date.now() - installStart
        logs.push(installResult.output)
        if (!installResult.ok) {
          return {
            success: false,
            framework,
            error: `Install failed (${Math.round(installDuration / 1000)}s)`,
            logs,
            buildDuration: installDuration,
          }
        }
        log(`Install completed in ${Math.round(installDuration / 1000)}s`)
      }

      // 7. Build
      let buildDuration: number | undefined
      if (cmds.build) {
        log(`Building: ${cmds.build}`)
        const buildStart = Date.now()
        const buildResult = await run(cmds.build, sourcePath, appEnv, BUILD_TIMEOUT_MS)
        buildDuration = Date.now() - buildStart
        logs.push(buildResult.output)
        if (!buildResult.ok) {
          return {
            success: false,
            framework,
            error: `Build failed (${Math.round(buildDuration / 1000)}s)`,
            logs,
            buildDuration,
          }
        }
        log(`Build completed in ${Math.round(buildDuration / 1000)}s`)
      }

      // 8. Pick a port
      const port = await findAvailablePort()
      log(`Assigned port: ${port}`)

      // 9. Start the app
      const startCmd = cmds.start.replace(/__PORT__/g, String(port))
      const startEnv: Record<string, string> = {
        ...appEnv,
        PORT: String(port),
        HOST: '0.0.0.0',
        // Inject ECONNRESET guard to prevent dev server crashes on client disconnect
        NODE_OPTIONS: buildNodeOptions(),
      }
      log(`Starting: ${startCmd}`)

      const startTime = Date.now()
      const appProcess = Bun.spawn(['sh', '-c', startCmd], {
        cwd: sourcePath,
        env: {
          ...process.env as Record<string, string>,
          ...startEnv,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Stream stdout/stderr into logs in the background
      this.captureProcessOutput(config.deploymentId, appProcess, logs)

      // 10. Wait for port to accept connections
      const ready = await waitForPort(port, START_WAIT_MS)
      const startDuration = Date.now() - startTime

      if (!ready) {
        // Check if process already exited
        const exited = appProcess.exitCode !== null
        if (exited) {
          // Give it a moment to flush output
          await Bun.sleep(500)
          return {
            success: false,
            framework,
            error: `App process exited with code ${appProcess.exitCode} before becoming ready`,
            logs,
            buildDuration,
            startDuration,
          }
        }
        // Process still running but port not responding — kill it
        appProcess.kill()
        return {
          success: false,
          framework,
          error: `App did not start listening on port ${port} within ${START_WAIT_MS / 1000}s`,
          logs,
          buildDuration,
          startDuration,
        }
      }

      // 11. Success — store deployment
      const deployment: RunningDeployment = {
        deploymentId: config.deploymentId,
        port,
        pid: appProcess.pid,
        process: appProcess,
        framework,
        sourcePath,
        startedAt: new Date(),
        logs,
        startCmd,
        startEnv,
      }
      this.runningDeployments.set(config.deploymentId, deployment)

      // Start auto-restart monitoring
      this.monitorProcess(deployment)

      log(`App started on port ${port} (pid ${appProcess.pid}) in ${Math.round(startDuration / 1000)}s`)

      return {
        success: true,
        port,
        pid: appProcess.pid,
        framework,
        logs,
        buildDuration,
        startDuration,
      }
    } catch (err) {
      log(`Unexpected error: ${String(err)}`)
      return {
        success: false,
        framework: config.framework || 'unknown',
        error: String(err),
        logs,
      }
    }
  }

  // -----------------------------------------------------------------------
  // Stop
  // -----------------------------------------------------------------------

  stop(deploymentId: string): { success: boolean; error?: string } {
    const deployment = this.runningDeployments.get(deploymentId)
    if (!deployment) {
      return { success: false, error: `Deployment not found: ${deploymentId}` }
    }

    try {
      deployment.process.kill()
    } catch {
      // Process may already be dead
    }

    this.runningDeployments.delete(deploymentId)
    console.log(`[Deployer] Stopped deployment ${deploymentId}`)
    return { success: true }
  }

  // -----------------------------------------------------------------------
  // Logs
  // -----------------------------------------------------------------------

  getLogs(deploymentId: string): { logs: string[]; error?: string } {
    const deployment = this.runningDeployments.get(deploymentId)
    if (!deployment) {
      return { logs: [], error: `Deployment not found: ${deploymentId}` }
    }
    return { logs: deployment.logs }
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  getStatus(deploymentId: string): {
    status: 'running' | 'stopped' | 'not_found'
    port?: number
    pid?: number
    framework?: string
    startedAt?: Date
  } {
    const deployment = this.runningDeployments.get(deploymentId)
    if (!deployment) {
      return { status: 'not_found' }
    }

    const exited = deployment.process.exitCode !== null
    if (exited) {
      this.runningDeployments.delete(deploymentId)
      return { status: 'stopped' }
    }

    return {
      status: 'running',
      port: deployment.port,
      pid: deployment.pid,
      framework: deployment.framework,
      startedAt: deployment.startedAt,
    }
  }

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  listDeployments(): Array<{
    deploymentId: string
    port: number
    pid: number
    framework: string
    sourcePath: string
    startedAt: Date
    status: 'running' | 'stopped'
  }> {
    const result: Array<{
      deploymentId: string
      port: number
      pid: number
      framework: string
      sourcePath: string
      startedAt: Date
      status: 'running' | 'stopped'
    }> = []

    for (const [id, dep] of this.runningDeployments) {
      const exited = dep.process.exitCode !== null
      if (exited) {
        this.runningDeployments.delete(id)
        continue
      }
      result.push({
        deploymentId: dep.deploymentId,
        port: dep.port,
        pid: dep.pid,
        framework: dep.framework,
        sourcePath: dep.sourcePath,
        startedAt: dep.startedAt,
        status: 'running',
      })
    }

    return result
  }

  // -----------------------------------------------------------------------
  // Internal: check if install step is needed
  // -----------------------------------------------------------------------

  private shouldRunInstall(installCmd: string, sourcePath: string): boolean {
    // npm/bun/yarn/pnpm install needs package.json
    if (installCmd.includes('npm ') || installCmd.includes('bun ') || installCmd.includes('yarn') || installCmd.includes('pnpm')) {
      return existsSync(join(sourcePath, 'package.json'))
    }
    // pip install needs requirements.txt
    if (installCmd.includes('pip ')) {
      return existsSync(join(sourcePath, 'requirements.txt'))
    }
    return true
  }

  // -----------------------------------------------------------------------
  // Internal: capture process output
  // -----------------------------------------------------------------------

  private captureProcessOutput(
    deploymentId: string,
    proc: ReturnType<typeof Bun.spawn>,
    logs: string[],
  ): void {
    const readStream = async (stream: ReadableStream<Uint8Array> | null, prefix: string) => {
      if (!stream) return
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          for (const line of text.split('\n')) {
            if (line.trim()) {
              logs.push(`[${prefix}] ${line}`)
            }
          }
          // Cap log size
          if (logs.length > 5000) {
            logs.splice(0, logs.length - 4000)
          }
        }
      } catch {
        // Stream closed
      }
    }

    readStream(proc.stdout as ReadableStream<Uint8Array> | null, 'stdout')
    readStream(proc.stderr as ReadableStream<Uint8Array> | null, 'stderr')
  }

  // -----------------------------------------------------------------------
  // Internal: auto-restart monitoring
  // -----------------------------------------------------------------------

  /**
   * Monitor a deployed process and auto-restart it if it crashes.
   * Uses exponential backoff with a reset after stable runtime.
   */
  private monitorProcess(deployment: RunningDeployment): void {
    let restartCount = 0
    let lastStartTime = Date.now()

    const onExit = async (exitCode: number) => {
      const runtime = Date.now() - lastStartTime
      const dep = this.runningDeployments.get(deployment.deploymentId)

      // Deployment was stopped manually — don't restart
      if (!dep) return

      // Reset restart counter if the process ran long enough to be considered stable
      if (runtime > STABLE_RUNTIME_MS) {
        restartCount = 0
      }

      // Check restart limit
      if (restartCount >= MAX_RESTARTS) {
        console.error(
          `[Deployer:${deployment.deploymentId}] Process crashed ${MAX_RESTARTS} times ` +
          `consecutively — giving up. Last exit code: ${exitCode}`
        )
        dep.logs.push(`[deployer] Auto-restart limit reached (${MAX_RESTARTS}). Giving up.`)
        this.runningDeployments.delete(deployment.deploymentId)
        return
      }

      restartCount++
      const delay = Math.min(BASE_RESTART_DELAY * Math.pow(2, restartCount - 1), MAX_RESTART_DELAY)

      console.warn(
        `[Deployer:${deployment.deploymentId}] Process exited (code ${exitCode}, ` +
        `ran ${Math.round(runtime / 1000)}s), restarting in ${delay}ms ` +
        `(attempt ${restartCount}/${MAX_RESTARTS})`
      )
      dep.logs.push(
        `[deployer] Process exited (code ${exitCode}). ` +
        `Restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})...`
      )

      await Bun.sleep(delay)

      // Re-check if deployment was stopped during sleep
      if (!this.runningDeployments.has(deployment.deploymentId)) return

      try {
        const proc = Bun.spawn(['sh', '-c', dep.startCmd], {
          cwd: dep.sourcePath,
          env: {
            ...process.env as Record<string, string>,
            ...dep.startEnv,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        })

        // Update deployment record
        dep.process = proc
        dep.pid = proc.pid
        dep.startedAt = new Date()
        lastStartTime = Date.now()

        // Capture output
        this.captureProcessOutput(dep.deploymentId, proc, dep.logs)

        // Wait for port
        const ready = await waitForPort(dep.port, 10_000)
        if (ready) {
          console.log(
            `[Deployer:${dep.deploymentId}] Restarted successfully on port ${dep.port} (pid ${proc.pid})`
          )
          dep.logs.push(`[deployer] Restarted on port ${dep.port} (pid ${proc.pid})`)
        } else {
          console.warn(
            `[Deployer:${dep.deploymentId}] Restarted but port ${dep.port} not responding`
          )
          dep.logs.push(`[deployer] Restarted but port ${dep.port} not responding yet`)
        }

        // Continue monitoring
        proc.exited.then(onExit)
      } catch (err) {
        console.error(`[Deployer:${dep.deploymentId}] Restart failed:`, err)
        dep.logs.push(`[deployer] Restart failed: ${String(err)}`)
        this.runningDeployments.delete(dep.deploymentId)
      }
    }

    // Start monitoring
    deployment.process.exited.then(onExit)
  }
}
