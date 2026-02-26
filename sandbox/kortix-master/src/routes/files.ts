/**
 * File management routes — direct sandbox filesystem access.
 *
 * This is the authoritative file I/O layer for the sandbox. All file
 * operations (list, read, download, upload, delete, mkdir, rename) are
 * handled here instead of proxying to OpenCode, giving us full control
 * over binary content handling and sandbox-wide filesystem access.
 *
 * Mounted at /file in kortix-master (e.g. GET /file/raw?path=...).
 *
 * Security: all paths are resolved to absolute and validated against
 * ALLOWED_ROOTS before any filesystem operation.
 */

import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import path from 'path'
import fs from 'fs/promises'
import {
  ErrorResponse,
  FileNode,
  FileContentTextResponse,
  FileContentBinaryResponse,
  UploadResult,
} from '../schemas/common'

const filesRouter = new Hono()

// ─── Security ────────────────────────────────────────────────────────────────

const ALLOWED_ROOTS = ['/workspace', '/opt', '/tmp', '/home']

/**
 * Resolve and validate a file path. Returns the absolute path.
 * Prevents directory traversal and restricts access to allowed roots.
 */
function resolvePath(raw: string): string {
  const resolved = path.resolve(raw)
  if (!ALLOWED_ROOTS.some((root) => resolved.startsWith(root))) {
    throw new Error('Access denied: path outside allowed directories')
  }
  return resolved
}

/** Return the resolved path or null (+ set 403 status) if validation fails. */
function validatePath(c: any, raw: string): string | null {
  try {
    return resolvePath(raw)
  } catch {
    c.status(403)
    return null
  }
}

// ─── Binary detection ────────────────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.avif', '.heic',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.wav', '.ogg', '.webm', '.flac', '.aac',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  '.sqlite', '.db', '.wasm',
  '.dmg', '.iso', '.img',
])

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

// ─── GET / — list directory ──────────────────────────────────────────────────

filesRouter.get('/',
  describeRoute({
    tags: ['Files'],
    summary: 'List directory',
    description: 'Lists files and directories at the given path. Defaults to /workspace. Filters out .git and .DS_Store entries.',
    responses: {
      200: { description: 'Directory listing', content: { 'application/json': { schema: resolver(z.array(FileNode)) } } },
      403: { description: 'Access denied', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      404: { description: 'Directory not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      500: { description: 'Server error', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const dirPath = c.req.query('path') || '/workspace'
    const resolved = validatePath(c, dirPath)
    if (!resolved) return c.json({ error: 'Access denied: path outside allowed directories' })

    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true })
      const nodes = entries
        .filter((e) => e.name !== '.git' && e.name !== '.DS_Store')
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          absolute: path.join(resolved, e.name),
          type: e.isDirectory() ? 'directory' as const : 'file' as const,
          ignored: false,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      return c.json(nodes)
    } catch (err: any) {
      if (err.code === 'ENOENT') return c.json({ error: 'Directory not found' }, 404)
      if (err.code === 'ENOTDIR') return c.json({ error: 'Not a directory' }, 400)
      return c.json({ error: err.message }, 500)
    }
  },
)

// ─── GET /content — read file content (JSON, with base64 for binaries) ───────

filesRouter.get('/content',
  describeRoute({
    tags: ['Files'],
    summary: 'Read file content',
    description: 'Returns file content as text or base64-encoded binary depending on file type. Returns empty text content for non-existent files.',
    responses: {
      200: {
        description: 'File content (text or binary)',
        content: {
          'application/json': {
            schema: resolver(z.union([FileContentTextResponse, FileContentBinaryResponse])),
          },
        },
      },
      400: { description: 'Missing path parameter', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      403: { description: 'Access denied', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'Missing path query parameter' }, 400)

    const resolved = validatePath(c, filePath)
    if (!resolved) return c.json({ error: 'Access denied: path outside allowed directories' })

    const file = Bun.file(resolved)
    if (!(await file.exists())) {
      return c.json({ type: 'text', content: '' })
    }

    const mimeType = file.type || 'application/octet-stream'

    if (isBinary(resolved)) {
      const buffer = await file.arrayBuffer().catch(() => new ArrayBuffer(0))
      const content = Buffer.from(buffer).toString('base64')
      return c.json({ type: 'binary', content, mimeType, encoding: 'base64' })
    }

    // Text file — read as string
    const content = await file.text().catch(() => '')
    return c.json({ type: 'text', content: content.trim() })
  },
)

// ─── GET /raw — download raw file bytes ──────────────────────────────────────

filesRouter.get('/raw',
  describeRoute({
    tags: ['Files'],
    summary: 'Download raw file',
    description: 'Returns raw file bytes with appropriate Content-Type and Content-Disposition headers for direct download.',
    responses: {
      200: { description: 'Raw file bytes' },
      400: { description: 'Missing path parameter', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      403: { description: 'Access denied', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      404: { description: 'File not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'Missing path query parameter' }, 400)

    const resolved = validatePath(c, filePath)
    if (!resolved) return c.json({ error: 'Access denied: path outside allowed directories' })

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
  },
)

// ─── POST /upload — upload files via multipart form data ─────────────────────

filesRouter.post('/upload',
  describeRoute({
    tags: ['Files'],
    summary: 'Upload files',
    description: 'Upload one or more files via multipart form data. Optionally specify a target directory via the `path` form field.',
    responses: {
      200: { description: 'Upload results', content: { 'application/json': { schema: resolver(z.array(UploadResult)) } } },
      400: { description: 'No files in request', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: true })
    const targetDir = typeof body['path'] === 'string' ? body['path'] : undefined
    const results: { path: string; size: number }[] = []

    for (const [key, value] of Object.entries(body)) {
      if (key === 'path') continue
      const files = Array.isArray(value) ? value : [value]
      for (const file of files) {
        if (typeof file === 'string') continue
        if (!(file instanceof globalThis.File)) continue
        const dest = targetDir
          ? targetDir + '/' + file.name
          : key === 'file' || key === 'file[]'
            ? file.name
            : key
        const resolved = resolvePath(dest)
        const buffer = await file.arrayBuffer()
        await fs.mkdir(path.dirname(resolved), { recursive: true })
        await Bun.write(resolved, buffer)
        results.push({ path: dest, size: buffer.byteLength })
      }
    }

    if (!results.length) return c.json({ error: 'No files found in request body' }, 400)
    return c.json(results)
  },
)

// ─── DELETE / — delete file or directory ─────────────────────────────────────

filesRouter.delete('/',
  describeRoute({
    tags: ['Files'],
    summary: 'Delete file or directory',
    description: 'Recursively deletes a file or directory at the given path.',
    responses: {
      200: { description: 'Deleted successfully' },
      400: { description: 'Missing path', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      403: { description: 'Access denied', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      404: { description: 'File not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const body = await c.req.json<{ path: string }>()
    if (!body.path) return c.json({ error: 'Missing path in request body' }, 400)

    const resolved = validatePath(c, body.path)
    if (!resolved) return c.json({ error: 'Access denied: path outside allowed directories' })

    const stat = await fs.stat(resolved).catch(() => null)
    if (!stat) return c.json({ error: 'File not found' }, 404)

    await fs.rm(resolved, { recursive: true, force: true })
    return c.json(true)
  },
)

// ─── POST /mkdir — create directory ──────────────────────────────────────────

filesRouter.post('/mkdir',
  describeRoute({
    tags: ['Files'],
    summary: 'Create directory',
    description: 'Creates a directory (and any missing parent directories) at the given path.',
    responses: {
      200: { description: 'Directory created' },
      400: { description: 'Missing path', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      403: { description: 'Access denied', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const body = await c.req.json<{ path: string }>()
    if (!body.path) return c.json({ error: 'Missing path in request body' }, 400)

    const resolved = validatePath(c, body.path)
    if (!resolved) return c.json({ error: 'Access denied: path outside allowed directories' })

    await fs.mkdir(resolved, { recursive: true })
    return c.json(true)
  },
)

// ─── POST /rename — rename or move file/directory ────────────────────────────

filesRouter.post('/rename',
  describeRoute({
    tags: ['Files'],
    summary: 'Rename or move',
    description: 'Renames or moves a file/directory from one path to another. Creates parent directories for the target path if needed.',
    responses: {
      200: { description: 'Renamed successfully' },
      400: { description: 'Missing from/to', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      403: { description: 'Access denied', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      404: { description: 'Source not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const body = await c.req.json<{ from: string; to: string }>()
    if (!body.from || !body.to) return c.json({ error: 'Missing from/to in request body' }, 400)

    const fromResolved = validatePath(c, body.from)
    if (!fromResolved) return c.json({ error: 'Access denied: source path outside allowed directories' })

    const toResolved = validatePath(c, body.to)
    if (!toResolved) return c.json({ error: 'Access denied: target path outside allowed directories' })

    const stat = await fs.stat(fromResolved).catch(() => null)
    if (!stat) return c.json({ error: 'Source file not found' }, 404)

    await fs.mkdir(path.dirname(toResolved), { recursive: true })
    await fs.rename(fromResolved, toResolved)
    return c.json(true)
  },
)

export default filesRouter

// z import needed for inline resolver usage
import { z } from 'zod'
