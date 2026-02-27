import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { describeRoute, resolver } from 'hono-openapi'
import {
  ErrorResponse,
  MemoryListResponse,
  MemoryStatsResponse,
  MemorySearchResponse,
} from '../schemas/common'
import { z } from 'zod'

const memoryRouter = new Hono()

// ─── DB Path ─────────────────────────────────────────────────────────────────
const DB_PATH = '/workspace/.local/share/opencode/storage/kortix-memory.db'

/**
 * Open the memory DB in read-only mode.
 * Returns null if the DB file doesn't exist yet (plugin hasn't initialized).
 */
function openDb(): Database | null {
  try {
    if (!existsSync(DB_PATH)) return null
    const db = new Database(DB_PATH, { readonly: true })
    db.exec('PRAGMA busy_timeout=3000')
    return db
  } catch (err) {
    console.error('[memory] Failed to open DB:', err)
    return null
  }
}

// ─── GET /memory/entries ─────────────────────────────────────────────────────
memoryRouter.get('/entries',
  describeRoute({
    tags: ['Memory'],
    summary: 'List all memory entries',
    description: 'Returns all long-term memories and observations from the memory database. Supports filtering by source (ltm/observation) and type, with pagination.',
    responses: {
      200: { description: 'Memory entries', content: { 'application/json': { schema: resolver(MemoryListResponse) } } },
      503: { description: 'Memory DB unavailable', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const db = openDb()
    if (!db) {
      return c.json({
        entries: [],
        total: { ltm: 0, observations: 0 },
      })
    }

    try {
      const source = c.req.query('source') // 'ltm' | 'observation' | undefined (both)
      const type = c.req.query('type')     // e.g. 'semantic', 'file_edit', etc.
      const limit = Math.min(parseInt(c.req.query('limit') || '200', 10), 500)
      const offset = parseInt(c.req.query('offset') || '0', 10)

      const entries: any[] = []

      // LTM entries
      if (!source || source === 'ltm') {
        let ltmSql = `SELECT id, type, content, context, source_session_id, tags, files, created_at, updated_at FROM long_term_memories`
        const ltmWhere: string[] = []
        const ltmParams: any[] = []

        if (type) {
          ltmWhere.push('type = ?')
          ltmParams.push(type)
        }

        if (ltmWhere.length > 0) ltmSql += ` WHERE ${ltmWhere.join(' AND ')}`
        ltmSql += ` ORDER BY created_at DESC`
        if (source === 'ltm') {
          ltmSql += ` LIMIT ? OFFSET ?`
          ltmParams.push(limit, offset)
        }

        const ltmRows = db.prepare(ltmSql).all(...ltmParams) as any[]
        for (const row of ltmRows) {
          entries.push({
            id: row.id,
            source: 'ltm',
            type: row.type,
            content: row.content,
            context: row.context || null,
            sessionId: row.source_session_id || null,
            tags: safeJsonParse(row.tags, []),
            files: safeJsonParse(row.files, []),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })
        }
      }

      // Observation entries
      if (!source || source === 'observation') {
        let obsSql = `SELECT id, session_id, type, title, narrative, facts, concepts, files_read, files_modified, tool_name, prompt_number, created_at FROM observations`
        const obsWhere: string[] = []
        const obsParams: any[] = []

        if (type) {
          obsWhere.push('type = ?')
          obsParams.push(type)
        }

        if (obsWhere.length > 0) obsSql += ` WHERE ${obsWhere.join(' AND ')}`
        obsSql += ` ORDER BY created_at DESC`
        if (source === 'observation') {
          obsSql += ` LIMIT ? OFFSET ?`
          obsParams.push(limit, offset)
        }

        const obsRows = db.prepare(obsSql).all(...obsParams) as any[]
        for (const row of obsRows) {
          entries.push({
            id: row.id,
            source: 'observation',
            type: row.type,
            content: row.narrative || row.title,
            title: row.title,
            narrative: row.narrative,
            sessionId: row.session_id,
            tags: safeJsonParse(row.concepts, []),
            files: [
              ...safeJsonParse(row.files_read, []),
              ...safeJsonParse(row.files_modified, []),
            ],
            facts: safeJsonParse(row.facts, []),
            toolName: row.tool_name,
            promptNumber: row.prompt_number,
            createdAt: row.created_at,
            updatedAt: null,
          })
        }
      }

      // Sort combined: LTM first, then by createdAt desc
      entries.sort((a, b) => {
        if (a.source !== b.source) return a.source === 'ltm' ? -1 : 1
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })

      // Apply limit to combined results
      const paged = entries.slice(offset, offset + limit)

      // Counts
      const ltmCount = (db.prepare('SELECT COUNT(*) as cnt FROM long_term_memories').get() as any)?.cnt ?? 0
      const obsCount = (db.prepare('SELECT COUNT(*) as cnt FROM observations').get() as any)?.cnt ?? 0

      db.close()

      return c.json({
        entries: paged,
        total: { ltm: ltmCount, observations: obsCount },
      })
    } catch (err) {
      db.close()
      console.error('[memory] Query failed:', err)
      return c.json({ error: 'Failed to query memory database', details: String(err) }, 503)
    }
  },
)

// ─── GET /memory/search ──────────────────────────────────────────────────────
memoryRouter.get('/search',
  describeRoute({
    tags: ['Memory'],
    summary: 'Search memories',
    description: 'Full-text search across long-term memories and observations using FTS5. LTM results are ranked higher.',
    responses: {
      200: { description: 'Search results', content: { 'application/json': { schema: resolver(MemorySearchResponse) } } },
      400: { description: 'Missing query', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      503: { description: 'Memory DB unavailable', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const query = c.req.query('q')
    if (!query || !query.trim()) {
      return c.json({ error: 'Missing required parameter: q' }, 400)
    }

    const db = openDb()
    if (!db) {
      return c.json({ entries: [], query: query.trim() })
    }

    try {
      const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100)
      const source = c.req.query('source') // 'ltm' | 'observation' | undefined
      const ftsQuery = query.trim().replace(/['"]/g, '') // sanitize for FTS5

      const entries: any[] = []

      // Search LTM via FTS5
      if (!source || source === 'ltm') {
        try {
          const ltmRows = db.prepare(`
            SELECT l.id, l.type, l.content, l.context, l.source_session_id, l.tags, l.files, l.created_at, l.updated_at,
                   ltm_fts.rank
            FROM ltm_fts
            JOIN long_term_memories l ON l.id = ltm_fts.rowid
            WHERE ltm_fts MATCH ?
            ORDER BY ltm_fts.rank
            LIMIT ?
          `).all(ftsQuery, limit) as any[]

          for (const row of ltmRows) {
            entries.push({
              id: row.id,
              source: 'ltm',
              type: row.type,
              content: row.content,
              context: row.context || null,
              sessionId: row.source_session_id || null,
              tags: safeJsonParse(row.tags, []),
              files: safeJsonParse(row.files, []),
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              rank: row.rank,
            })
          }
        } catch {
          // FTS5 query may fail on malformed input — fallback to LIKE
          const ltmRows = db.prepare(`
            SELECT id, type, content, context, source_session_id, tags, files, created_at, updated_at
            FROM long_term_memories
            WHERE content LIKE ? OR tags LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(`%${ftsQuery}%`, `%${ftsQuery}%`, limit) as any[]

          for (const row of ltmRows) {
            entries.push({
              id: row.id,
              source: 'ltm',
              type: row.type,
              content: row.content,
              context: row.context || null,
              sessionId: row.source_session_id || null,
              tags: safeJsonParse(row.tags, []),
              files: safeJsonParse(row.files, []),
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              rank: 0,
            })
          }
        }
      }

      // Search observations via FTS5
      if (!source || source === 'observation') {
        try {
          const obsRows = db.prepare(`
            SELECT o.id, o.session_id, o.type, o.title, o.narrative, o.facts, o.concepts, o.files_read, o.files_modified, o.tool_name, o.created_at,
                   observations_fts.rank
            FROM observations_fts
            JOIN observations o ON o.id = observations_fts.rowid
            WHERE observations_fts MATCH ?
            ORDER BY observations_fts.rank
            LIMIT ?
          `).all(ftsQuery, limit) as any[]

          for (const row of obsRows) {
            entries.push({
              id: row.id,
              source: 'observation',
              type: row.type,
              content: row.narrative || row.title,
              title: row.title,
              narrative: row.narrative,
              sessionId: row.session_id,
              tags: safeJsonParse(row.concepts, []),
              files: [
                ...safeJsonParse(row.files_read, []),
                ...safeJsonParse(row.files_modified, []),
              ],
              facts: safeJsonParse(row.facts, []),
              toolName: row.tool_name,
              createdAt: row.created_at,
              rank: row.rank,
            })
          }
        } catch {
          // FTS5 fallback
          const obsRows = db.prepare(`
            SELECT id, session_id, type, title, narrative, facts, concepts, files_read, files_modified, tool_name, created_at
            FROM observations
            WHERE title LIKE ? OR narrative LIKE ? OR concepts LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(`%${ftsQuery}%`, `%${ftsQuery}%`, `%${ftsQuery}%`, limit) as any[]

          for (const row of obsRows) {
            entries.push({
              id: row.id,
              source: 'observation',
              type: row.type,
              content: row.narrative || row.title,
              title: row.title,
              sessionId: row.session_id,
              tags: safeJsonParse(row.concepts, []),
              files: [
                ...safeJsonParse(row.files_read, []),
                ...safeJsonParse(row.files_modified, []),
              ],
              facts: safeJsonParse(row.facts, []),
              toolName: row.tool_name,
              createdAt: row.created_at,
              rank: 0,
            })
          }
        }
      }

      // Sort: LTM first (ranked higher), then by rank
      entries.sort((a, b) => {
        if (a.source !== b.source) return a.source === 'ltm' ? -1 : 1
        return (a.rank ?? 0) - (b.rank ?? 0) // FTS5 rank is negative, lower = better
      })

      db.close()

      return c.json({
        entries: entries.slice(0, limit),
        query: query.trim(),
      })
    } catch (err) {
      db.close()
      console.error('[memory] Search failed:', err)
      return c.json({ error: 'Search failed', details: String(err) }, 503)
    }
  },
)

// ─── GET /memory/stats ───────────────────────────────────────────────────────
memoryRouter.get('/stats',
  describeRoute({
    tags: ['Memory'],
    summary: 'Memory statistics',
    description: 'Returns counts and type breakdowns for both long-term memories and observations.',
    responses: {
      200: { description: 'Memory stats', content: { 'application/json': { schema: resolver(MemoryStatsResponse) } } },
    },
  }),
  async (c) => {
    const db = openDb()
    if (!db) {
      return c.json({
        ltm: { total: 0, byType: {} },
        observations: { total: 0, byType: {} },
        sessions: 0,
      })
    }

    try {
      const ltmTotal = (db.prepare('SELECT COUNT(*) as cnt FROM long_term_memories').get() as any)?.cnt ?? 0
      const obsTotal = (db.prepare('SELECT COUNT(*) as cnt FROM observations').get() as any)?.cnt ?? 0
      const sessTotal = (db.prepare('SELECT COUNT(*) as cnt FROM session_meta').get() as any)?.cnt ?? 0

      const ltmByType: Record<string, number> = {}
      const ltmTypes = db.prepare('SELECT type, COUNT(*) as cnt FROM long_term_memories GROUP BY type').all() as any[]
      for (const row of ltmTypes) ltmByType[row.type] = row.cnt

      const obsByType: Record<string, number> = {}
      const obsTypes = db.prepare('SELECT type, COUNT(*) as cnt FROM observations GROUP BY type').all() as any[]
      for (const row of obsTypes) obsByType[row.type] = row.cnt

      db.close()

      return c.json({
        ltm: { total: ltmTotal, byType: ltmByType },
        observations: { total: obsTotal, byType: obsByType },
        sessions: sessTotal,
      })
    } catch (err) {
      db.close()
      console.error('[memory] Stats query failed:', err)
      return c.json({
        ltm: { total: 0, byType: {} },
        observations: { total: 0, byType: {} },
        sessions: 0,
      })
    }
  },
)

// ─── DELETE /memory/entries/:id ──────────────────────────────────────────────
memoryRouter.delete('/entries/:source/:id',
  describeRoute({
    tags: ['Memory'],
    summary: 'Delete a memory entry',
    description: 'Deletes a specific memory entry by source (ltm/observation) and ID.',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: resolver(z.object({ ok: z.literal(true), deleted: z.number() })) } } },
      400: { description: 'Invalid params', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      503: { description: 'DB unavailable', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    const source = c.req.param('source')
    const id = parseInt(c.req.param('id'), 10)

    if (!['ltm', 'observation'].includes(source) || isNaN(id)) {
      return c.json({ error: 'Invalid source or id' }, 400)
    }

    // Open writable
    let db: Database
    try {
      if (!existsSync(DB_PATH)) {
        return c.json({ error: 'Memory database not found' }, 503)
      }
      db = new Database(DB_PATH)
      db.exec('PRAGMA busy_timeout=3000')
    } catch (err) {
      return c.json({ error: 'Failed to open DB', details: String(err) }, 503)
    }

    try {
      const table = source === 'ltm' ? 'long_term_memories' : 'observations'
      const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
      db.close()

      return c.json({ ok: true as const, deleted: result.changes })
    } catch (err) {
      db.close()
      return c.json({ error: 'Delete failed', details: String(err) }, 503)
    }
  },
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeJsonParse(val: string | null | undefined, fallback: any[]): any[] {
  if (!val) return fallback
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export default memoryRouter
