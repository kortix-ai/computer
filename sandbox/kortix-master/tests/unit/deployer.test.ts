/**
 * Unit tests for the Deployer service.
 *
 * Tests framework detection, command generation, port finding,
 * and real deployment lifecycle with tiny test apps.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Deployer } from '../../src/services/deployer'

// Track all temp dirs and deployer instances for cleanup
const tempDirs: string[] = []
const deployers: Deployer[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deployer-test-'))
  tempDirs.push(dir)
  return dir
}

afterAll(async () => {
  // Stop all running deployments across all deployer instances
  for (const deployer of deployers) {
    for (const dep of deployer.listDeployments()) {
      deployer.stop(dep.deploymentId)
    }
  }
  // Wait for processes to exit
  await Bun.sleep(500)
  // Clean up temp dirs
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

// ─── Framework Detection ─────────────────────────────────────────────────────

describe('Deployer — Framework Detection', () => {
  const deployer = new Deployer()
  deployers.push(deployer)

  it('detects nextjs from package.json', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0', react: '18.0.0' },
    }))
    expect(deployer.detectFramework(dir)).toBe('nextjs')
  })

  it('detects vite from package.json', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      devDependencies: { vite: '5.0.0' },
    }))
    expect(deployer.detectFramework(dir)).toBe('vite')
  })

  it('detects vite from @vitejs scoped package', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      devDependencies: { '@vitejs/plugin-react': '4.0.0' },
    }))
    expect(deployer.detectFramework(dir)).toBe('vite')
  })

  it('detects cra from react-scripts', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'react-scripts': '5.0.0' },
    }))
    expect(deployer.detectFramework(dir)).toBe('cra')
  })

  it('detects node from express', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '4.0.0' },
    }))
    expect(deployer.detectFramework(dir)).toBe('node')
  })

  it('detects node from hono', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { hono: '4.0.0' },
    }))
    expect(deployer.detectFramework(dir)).toBe('node')
  })

  it('detects node from start script', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { start: 'node server.js' },
    }))
    expect(deployer.detectFramework(dir)).toBe('node')
  })

  it('detects python from requirements.txt', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'requirements.txt'), 'flask==3.0.0\n')
    expect(deployer.detectFramework(dir)).toBe('python')
  })

  it('detects python from pyproject.toml', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "myapp"\n')
    expect(deployer.detectFramework(dir)).toBe('python')
  })

  it('detects static from index.html', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'index.html'), '<html><body>Hello</body></html>')
    expect(deployer.detectFramework(dir)).toBe('static')
  })

  it('returns unknown for empty directory', () => {
    const dir = makeTempDir()
    expect(deployer.detectFramework(dir)).toBe('unknown')
  })

  it('returns unknown for invalid JSON in package.json', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package.json'), 'not json{{{')
    expect(deployer.detectFramework(dir)).toBe('unknown')
  })
})

// ─── Framework Commands ──────────────────────────────────────────────────────

describe('Deployer — Framework Commands', () => {
  const deployer = new Deployer()
  deployers.push(deployer)
  const dir = makeTempDir()
  const baseConfig = { deploymentId: 'test', sourceType: 'files' as const, sourcePath: dir }

  it('nextjs has install, build, start', () => {
    const cmds = deployer.getFrameworkCommands('nextjs', dir, baseConfig)
    expect(cmds.install).toBe('npm install')
    expect(cmds.build).toBe('npm run build')
    expect(cmds.start).toBe('npm start')
    expect(cmds.defaultPort).toBe(3000)
  })

  it('vite has install, build, start with preview', () => {
    const cmds = deployer.getFrameworkCommands('vite', dir, baseConfig)
    expect(cmds.install).toBe('npm install')
    expect(cmds.build).toBe('npm run build')
    expect(cmds.start).toContain('vite preview')
    expect(cmds.start).toContain('__PORT__')
  })

  it('static has no install/build, start with serve', () => {
    const cmds = deployer.getFrameworkCommands('static', dir, baseConfig)
    expect(cmds.install).toBeNull()
    expect(cmds.build).toBeNull()
    expect(cmds.start).toContain('serve')
    expect(cmds.start).toContain('__PORT__')
  })

  it('python has pip install, python start', () => {
    writeFileSync(join(dir, 'requirements.txt'), 'flask\n')
    const cmds = deployer.getFrameworkCommands('python', dir, baseConfig)
    expect(cmds.install).toContain('pip install')
    expect(cmds.start).toContain('python')
    expect(cmds.defaultPort).toBe(8080)
  })

  it('node has npm install, npm start', () => {
    const cmds = deployer.getFrameworkCommands('node', dir, baseConfig)
    expect(cmds.install).toBe('npm install')
    expect(cmds.build).toBeNull()
    expect(cmds.start).toBe('npm start')
  })

  it('respects custom entrypoint', () => {
    const cmds = deployer.getFrameworkCommands('node', dir, {
      ...baseConfig,
      entrypoint: 'bun run server.ts',
    })
    expect(cmds.start).toBe('bun run server.ts')
  })
})

// ─── Deploy Lifecycle — Real Bun Server ──────────────────────────────────────

describe('Deployer — Real Deployment (Bun server)', () => {
  const deployer = new Deployer()
  deployers.push(deployer)
  let deployId: string

  it('deploys a simple Bun server', async () => {
    const dir = makeTempDir()
    const port = 10000 + Math.floor(Math.random() * 50000)

    // Write a simple Bun server
    writeFileSync(join(dir, 'server.js'), `
      Bun.serve({
        port: process.env.PORT || ${port},
        fetch(req) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })
      console.log('Server started on port ' + (process.env.PORT || ${port}))
    `)

    deployId = `test-bun-${Date.now()}`
    const result = await deployer.deploy({
      deploymentId: deployId,
      sourceType: 'files',
      sourcePath: dir,
      framework: 'node',
      entrypoint: 'bun server.js',
    })

    expect(result.success).toBe(true)
    expect(result.port).toBeDefined()
    expect(result.pid).toBeDefined()
    expect(result.framework).toBe('node')
    expect(result.port).toBeGreaterThanOrEqual(10000)

    // Verify the app actually responds
    const res = await fetch(`http://localhost:${result.port}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  }, 30000)

  it('lists the running deployment', () => {
    const list = deployer.listDeployments()
    expect(list.length).toBeGreaterThanOrEqual(1)
    const dep = list.find(d => d.deploymentId === deployId)
    expect(dep).toBeDefined()
    expect(dep!.status).toBe('running')
  })

  it('gets status of running deployment', () => {
    const status = deployer.getStatus(deployId)
    expect(status.status).toBe('running')
    expect(status.port).toBeDefined()
    expect(status.pid).toBeDefined()
  })

  it('gets logs of running deployment', () => {
    const result = deployer.getLogs(deployId)
    expect(result.logs).toBeArray()
    expect(result.logs.length).toBeGreaterThan(0)
  })

  it('stops the deployment', async () => {
    const result = deployer.stop(deployId)
    expect(result.success).toBe(true)

    await Bun.sleep(200)

    // Verify it's removed from list
    const list = deployer.listDeployments()
    expect(list.find(d => d.deploymentId === deployId)).toBeUndefined()
  })

  it('returns not_found status for stopped deployment', () => {
    const status = deployer.getStatus(deployId)
    expect(status.status).toBe('not_found')
  })
})

// ─── Error Handling ──────────────────────────────────────────────────────────

describe('Deployer — Error Handling', () => {
  const deployer = new Deployer()
  deployers.push(deployer)

  it('returns error for non-existent source path', async () => {
    const result = await deployer.deploy({
      deploymentId: 'err-path',
      sourceType: 'files',
      sourcePath: '/nonexistent/path/that/does/not/exist',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Source path not found')
  })

  it('stop returns error for non-existent deployment', () => {
    const result = deployer.stop('nonexistent-id')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('getLogs returns empty for non-existent deployment', () => {
    const result = deployer.getLogs('nonexistent-id')
    expect(result.logs).toEqual([])
    expect(result.error).toBeDefined()
  })

  it('getStatus returns not_found for non-existent deployment', () => {
    const status = deployer.getStatus('nonexistent-id')
    expect(status.status).toBe('not_found')
  })

  it('returns error when app process exits immediately', async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'bad.js'), 'process.exit(1)')

    const result = await deployer.deploy({
      deploymentId: `err-exit-${Date.now()}`,
      sourceType: 'files',
      sourcePath: dir,
      framework: 'node',
      entrypoint: 'bun bad.js',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  }, 30000)
})

// ─── Multiple Concurrent Deployments ─────────────────────────────────────────

describe('Deployer — Multiple Concurrent Deployments', () => {
  const deployer = new Deployer()
  deployers.push(deployer)

  it('can run two apps simultaneously on different ports', async () => {
    const dir1 = makeTempDir()
    const dir2 = makeTempDir()

    writeFileSync(join(dir1, 'server.js'), `
      Bun.serve({
        port: process.env.PORT,
        fetch: () => new Response('app1'),
      })
    `)
    writeFileSync(join(dir2, 'server.js'), `
      Bun.serve({
        port: process.env.PORT,
        fetch: () => new Response('app2'),
      })
    `)

    const [r1, r2] = await Promise.all([
      deployer.deploy({
        deploymentId: `multi-1-${Date.now()}`,
        sourceType: 'files',
        sourcePath: dir1,
        framework: 'node',
        entrypoint: 'bun server.js',
      }),
      deployer.deploy({
        deploymentId: `multi-2-${Date.now()}`,
        sourceType: 'files',
        sourcePath: dir2,
        framework: 'node',
        entrypoint: 'bun server.js',
      }),
    ])

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(r1.port).not.toBe(r2.port)

    // Both respond
    const [res1, res2] = await Promise.all([
      fetch(`http://localhost:${r1.port}`).then(r => r.text()),
      fetch(`http://localhost:${r2.port}`).then(r => r.text()),
    ])
    expect(res1).toBe('app1')
    expect(res2).toBe('app2')

    // List shows both
    const list = deployer.listDeployments()
    expect(list.length).toBeGreaterThanOrEqual(2)
  }, 30000)
})
