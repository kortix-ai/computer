/**
 * File management routes — direct sandbox filesystem access.
 *
 * These routes serve raw file bytes from the sandbox filesystem,
 * bypassing the OpenCode JSON API which cannot transfer binary content.
 * This is the authoritative file I/O layer for the sandbox.
 *
 * Mounted at /file in kortix-master (e.g. GET /file/raw?path=...).
 */

import { Hono } from 'hono'
import path from 'path'

const filesRouter = new Hono()

// ─── Security ────────────────────────────────────────────────────────────────

const ALLOWED_ROOTS = ['/workspace', '/opt', '/tmp', '/home']

/**
 * Resolve and validate a file path. Returns the absolute path or throws.
 * Prevents directory traversal and restricts access to allowed roots.
 */
function resolvePath(raw: string): string {
  const resolved = path.resolve(raw)
  if (!ALLOWED_ROOTS.some((root) => resolved.startsWith(root))) {
    throw new Error('Access denied: path outside allowed directories')
  }
  return resolved
}

// ─── GET /raw — download raw file bytes ──────────────────────────────────────

filesRouter.get('/raw', async (c) => {
  const filePath = c.req.query('path')
  if (!filePath) {
    return c.json({ error: 'Missing path query parameter' }, 400)
  }

  let resolved: string
  try {
    resolved = resolvePath(filePath)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 403)
  }

  const file = Bun.file(resolved)
  if (!(await file.exists())) {
    return c.json({ error: 'File not found' }, 404)
  }

  const mimeType = file.type || 'application/octet-stream'
  const fileName = path.basename(resolved)
  const buffer = await file.arrayBuffer()

  c.header('Content-Type', mimeType)
  c.header('Content-Disposition', `attachment; filename="${fileName}"`)
  c.header('Content-Length', buffer.byteLength.toString())
  return c.body(buffer)
})

export default filesRouter
