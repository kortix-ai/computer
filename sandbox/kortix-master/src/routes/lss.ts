import { Hono } from 'hono'

const lssRouter = new Hono()

/**
 * GET /lss/search?q=<query>&k=<limit>&path=<scope>&ext=<extensions>
 *
 * Runs the `lss` CLI (Local Semantic Search) as a child process and returns
 * the raw JSON response. This provides semantic search (BM25 + embeddings)
 * over all indexed files in the workspace.
 *
 * Parameters:
 *   q     (required) — Search query string
 *   k     (optional, default 10) — Max results
 *   path  (optional, default /workspace) — Search scope path
 *   ext   (optional) — Comma-separated include extensions (e.g. ".ts,.py")
 *
 * Returns the lss --json output directly:
 *   [{ query: string, hits: [{ file_path, score, snippet, rank_stage, indexed_at }] }]
 */
lssRouter.get('/search', async (c) => {
  const query = c.req.query('q')
  if (!query || !query.trim()) {
    return c.json({ error: 'Missing required parameter: q' }, 400)
  }

  const limit = parseInt(c.req.query('k') || '10', 10)
  const searchPath = c.req.query('path') || '/workspace'
  const ext = c.req.query('ext') // e.g. ".ts,.py,.md"

  // Build lss command arguments
  const args: string[] = [
    query.trim(),
    '-p', searchPath,
    '--json',
    '-k', String(Math.min(Math.max(limit, 1), 50)), // clamp 1-50
    '--no-index', // skip re-indexing for speed — lss-sync handles indexing
  ]

  // Add extension filters if provided
  if (ext) {
    for (const e of ext.split(',').map(s => s.trim()).filter(Boolean)) {
      args.push('-e', e.startsWith('.') ? e : `.${e}`)
    }
  }

  try {
    const proc = Bun.spawn(['lss', ...args], {
      env: {
        ...process.env,
        LSS_DIR: '/workspace/.lss',
        HOME: '/workspace',
        PATH: '/lsiopy/bin:/usr/local/bin:/usr/bin:/bin',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // 15-second timeout
    const timeout = setTimeout(() => {
      try { proc.kill() } catch {}
    }, 15_000)

    const exitCode = await proc.exited
    clearTimeout(timeout)

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      console.error(`[lss] Exit code ${exitCode}: ${stderr}`)
      // If lss fails, return empty results rather than erroring out
      return c.json([{ query: query.trim(), hits: [] }])
    }

    // Parse and forward the JSON response
    try {
      const data = JSON.parse(stdout)
      return c.json(data)
    } catch {
      console.error('[lss] Failed to parse JSON output:', stdout.slice(0, 500))
      return c.json([{ query: query.trim(), hits: [] }])
    }
  } catch (error) {
    console.error('[lss] Failed to spawn process:', error)
    return c.json(
      { error: 'LSS search unavailable', details: String(error) },
      503,
    )
  }
})

/**
 * GET /lss/status
 *
 * Quick health check for the LSS index.
 */
lssRouter.get('/status', async (c) => {
  try {
    const proc = Bun.spawn(['lss', 'status'], {
      env: {
        ...process.env,
        LSS_DIR: '/workspace/.lss',
        HOME: '/workspace',
        PATH: '/lsiopy/bin:/usr/local/bin:/usr/bin:/bin',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()

    return c.json({
      available: exitCode === 0,
      output: stdout.trim(),
    })
  } catch {
    return c.json({ available: false, output: 'lss binary not found' })
  }
})

export default lssRouter
