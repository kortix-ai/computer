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
import { config } from '../config'
import defaultSuggestions from '../data/default-suggestions.json'

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

// ─── GET /memory/suggestions ─────────────────────────────────────────────────

interface Suggestion {
  text: string
  category: string
  icon: string
}

interface SuggestionsCache {
  suggestions: Suggestion[]
  personalized: boolean
  timestamp: number
}

const SUGGESTIONS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
let suggestionsCache: SuggestionsCache | null = null

const SuggestionsResponse = z.object({
  suggestions: z.array(z.object({
    text: z.string(),
    category: z.string(),
    icon: z.string(),
  })),
  personalized: z.boolean(),
  cached: z.boolean(),
})

/**
 * Pick N random items from an array (Fisher-Yates partial shuffle).
 */
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const result: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(idx, 1)[0])
  }
  return result
}

/**
 * Call the Kortix Router (OpenAI-compatible) to generate personalized suggestions.
 */
async function generateSuggestionsViaLLM(memories: any[]): Promise<Suggestion[] | null> {
  const apiUrl = config.KORTIX_API_URL
  const token = config.KORTIX_TOKEN
  if (!apiUrl || !token) return null

  // Build a concise summary of memories for the LLM
  const memorySummary = memories.map((m, i) => {
    const typeLabel = m.source === 'ltm' ? `[${m.type}]` : `[observation:${m.type}]`
    const tags = (m.tags || []).join(', ')
    const files = (m.files || []).slice(0, 3).join(', ')
    return `${i + 1}. ${typeLabel} ${m.content?.slice(0, 200) || m.title || '(no content)'}${tags ? ` | tags: ${tags}` : ''}${files ? ` | files: ${files}` : ''}`
  }).join('\n')

  const systemPrompt = `You generate short, actionable prompt suggestions for a coding AI assistant's home screen. The user has been working on projects and you have access to their memory context below.

Generate exactly 6 suggestions as a JSON array. Each suggestion should be a natural sentence the user might type into a chat input. Mix these categories:
- 2-3 "continue" suggestions: pick up recent work, follow up on tasks, or revisit files
- 1-2 "explore" suggestions: investigate or review something in their codebase
- 1-2 "create" suggestions: build something new or improve existing work

Rules:
- Keep each suggestion under 60 characters if possible, max 80
- Be specific — reference actual projects, files, or topics from their memories
- Don't be generic — avoid "help me with code" type suggestions
- Sound natural, like something the user would actually type
- Each object must have: "text" (the prompt), "category" (continue|explore|create|automate|research), "icon" (one of: code, search, git, list, test, bug, rocket, terminal, book, sparkles, file, shield, zap, calendar, presentation)

Return ONLY a valid JSON array, no markdown, no explanation.`

  try {
    const res = await fetch(`${apiUrl}/v1/router/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'kortix/basic',
        max_tokens: 1024,
        temperature: 0.8,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here are my recent memories:\n\n${memorySummary}\n\nGenerate personalized prompt suggestions based on this context.` },
        ],
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    if (!res.ok) {
      console.error(`[memory/suggestions] LLM call failed: ${res.status} ${res.statusText}`)
      return null
    }

    const data = await res.json() as any
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null

    // Parse JSON from the response — handle possible markdown wrapping
    const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return null

    // Validate and normalize
    return parsed
      .filter((s: any) => s && typeof s.text === 'string' && s.text.trim())
      .slice(0, 8)
      .map((s: any) => ({
        text: s.text.trim(),
        category: s.category || 'explore',
        icon: s.icon || 'sparkles',
      }))
  } catch (err) {
    console.error('[memory/suggestions] LLM generation failed:', err)
    return null
  }
}

memoryRouter.get('/suggestions',
  describeRoute({
    tags: ['Memory'],
    summary: 'Get personalized prompt suggestions',
    description: 'Returns personalized prompt suggestions based on the user\'s memories. Uses an LLM to generate contextual suggestions. Falls back to default suggestions if no memories exist or LLM is unavailable. Results are cached for 5 minutes.',
    responses: {
      200: { description: 'Prompt suggestions', content: { 'application/json': { schema: resolver(SuggestionsResponse) } } },
    },
  }),
  async (c) => {
    // Check cache first
    if (suggestionsCache && (Date.now() - suggestionsCache.timestamp) < SUGGESTIONS_CACHE_TTL) {
      return c.json({
        suggestions: suggestionsCache.suggestions,
        personalized: suggestionsCache.personalized,
        cached: true,
      })
    }

    // Try to load memories from DB
    const db = openDb()
    if (!db) {
      // No DB — return random defaults
      const defaults = pickRandom(defaultSuggestions.suggestions, 6)
      return c.json({ suggestions: defaults, personalized: false, cached: false })
    }

    try {
      // Fetch a mix of recent LTM entries
      const ltmRows = db.prepare(`
        SELECT id, type, content, context, tags, files, created_at
        FROM long_term_memories
        ORDER BY created_at DESC
        LIMIT 20
      `).all() as any[]

      // Also fetch a few recent observations for recency context
      const obsRows = db.prepare(`
        SELECT id, type, title, narrative, concepts, files_read, files_modified, created_at
        FROM observations
        ORDER BY created_at DESC
        LIMIT 10
      `).all() as any[]

      db.close()

      // Normalize into a common shape
      const memories = [
        ...ltmRows.map((r: any) => ({
          source: 'ltm',
          type: r.type,
          content: r.content,
          tags: safeJsonParse(r.tags, []),
          files: safeJsonParse(r.files, []),
          createdAt: r.created_at,
        })),
        ...obsRows.map((r: any) => ({
          source: 'observation',
          type: r.type,
          content: r.narrative || r.title,
          title: r.title,
          tags: safeJsonParse(r.concepts, []),
          files: [...safeJsonParse(r.files_read, []), ...safeJsonParse(r.files_modified, [])],
          createdAt: r.created_at,
        })),
      ]

      if (memories.length === 0) {
        // No memories yet — return defaults
        const defaults = pickRandom(defaultSuggestions.suggestions, 6)
        return c.json({ suggestions: defaults, personalized: false, cached: false })
      }

      // Try LLM generation
      const llmSuggestions = await generateSuggestionsViaLLM(memories)

      if (llmSuggestions && llmSuggestions.length >= 3) {
        // Cache and return LLM suggestions
        suggestionsCache = {
          suggestions: llmSuggestions,
          personalized: true,
          timestamp: Date.now(),
        }
        return c.json({
          suggestions: llmSuggestions,
          personalized: true,
          cached: false,
        })
      }

      // LLM failed — generate heuristic suggestions from memories
      const heuristic = generateHeuristicSuggestions(memories)
      suggestionsCache = {
        suggestions: heuristic,
        personalized: heuristic.some(s => s.category === 'continue'),
        timestamp: Date.now(),
      }
      return c.json({
        suggestions: heuristic,
        personalized: heuristic.some(s => s.category === 'continue'),
        cached: false,
      })
    } catch (err) {
      console.error('[memory/suggestions] Failed:', err)
      const defaults = pickRandom(defaultSuggestions.suggestions, 6)
      return c.json({ suggestions: defaults, personalized: false, cached: false })
    }
  },
)

/**
 * Generate heuristic suggestions when LLM is unavailable.
 * Uses memory content to fill templates.
 */
function generateHeuristicSuggestions(memories: any[]): Suggestion[] {
  const suggestions: Suggestion[] = []

  // Find recent episodic memories (what happened)
  const episodic = memories.filter(m => m.source === 'ltm' && m.type === 'episodic')
  if (episodic.length > 0) {
    const recent = episodic[0]
    const snippet = (recent.content || '').slice(0, 55)
    if (snippet) {
      suggestions.push({
        text: `Continue: ${snippet}${recent.content.length > 55 ? '...' : ''}`,
        category: 'continue',
        icon: 'code',
      })
    }
  }

  // Find files from recent observations
  const recentFiles = memories
    .flatMap(m => m.files || [])
    .filter((f: string) => f && !f.includes('node_modules'))
    .slice(0, 3)

  if (recentFiles.length > 0) {
    const shortPath = recentFiles[0].split('/').slice(-2).join('/')
    suggestions.push({
      text: `Review changes in ${shortPath}`,
      category: 'explore',
      icon: 'search',
    })
  }

  // Find semantic memories (known facts)
  const semantic = memories.filter(m => m.source === 'ltm' && m.type === 'semantic')
  if (semantic.length > 0) {
    suggestions.push({
      text: 'Check the project architecture and dependencies',
      category: 'explore',
      icon: 'book',
    })
  }

  // Find procedural memories (workflows)
  const procedural = memories.filter(m => m.source === 'ltm' && m.type === 'procedural')
  if (procedural.length > 0) {
    const proc = procedural[0]
    const snippet = (proc.content || '').slice(0, 50)
    if (snippet) {
      suggestions.push({
        text: `Run workflow: ${snippet}${proc.content.length > 50 ? '...' : ''}`,
        category: 'automate',
        icon: 'terminal',
      })
    }
  }

  // Fill remaining slots with relevant defaults
  const remaining = 6 - suggestions.length
  if (remaining > 0) {
    const defaults = pickRandom(defaultSuggestions.suggestions, remaining)
    suggestions.push(...defaults)
  }

  return suggestions.slice(0, 6)
}

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
