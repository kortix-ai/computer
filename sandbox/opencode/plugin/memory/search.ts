/**
 * Search Service for Memory Plugin
 *
 * Implements the 3-layer progressive disclosure pattern from claude-mem:
 *   1. search() → Compact index (~50-100 tokens/result)
 *   2. timeline() → Chronological context around an observation
 *   3. getObservationsBatch() → Full details (~500-1000 tokens each)
 *
 * Search priority:
 *   1. LSS (Local Semantic Search) — hybrid BM25 + embedding search via lss CLI
 *   2. FTS5 fallback — keyword matching when LSS is unavailable
 *
 * LSS provides richer results (conceptual similarity) while FTS5 handles
 * exact keyword matching. Both are always available; LSS is preferred.
 */

import type { Database } from "bun:sqlite"
import type { Observation, ObservationIndex, ObservationType, SessionSummary } from "./db"
import { getObservationIndexByIds } from "./db"
import { searchViaLss } from "./lss"

// =============================================================================
// TYPES
// =============================================================================

export interface SearchOptions {
	query: string
	limit?: number // default 20, max 100
	offset?: number // default 0
	type?: ObservationType // filter by observation type
	projectId?: string // filter by project
	dateStart?: string // YYYY-MM-DD
	dateEnd?: string // YYYY-MM-DD
	orderBy?: "date_desc" | "date_asc" | "relevance" // default date_desc
}

export interface SearchResult {
	observations: ObservationIndex[]
	totalEstimate: number
}

export interface TimelineResult {
	observations: TimelineEntry[]
	anchorIndex: number // index of the anchor in the array
}

export interface TimelineEntry {
	id: number
	type: ObservationType
	title: string
	subtitle: string | null
	narrative: string | null
	toolName: string | null
	filesRead: string[]
	filesModified: string[]
	createdAt: number
	isAnchor: boolean
}

// =============================================================================
// LAYER 1: SEARCH (Compact Index)
// =============================================================================

/**
 * Search observations using LSS semantic search with FTS5 fallback.
 * Returns compact index entries optimized for minimal token usage.
 *
 * Search priority:
 *   1. LSS (hybrid BM25 + embedding) — richer semantic matching
 *   2. FTS5 — keyword matching fallback when LSS is unavailable
 *
 * Supports filtering by type, project, date range (applied post-search).
 */
export function searchObservations(db: Database, opts: SearchOptions): SearchResult {
	const limit = Math.min(opts.limit ?? 20, 100)
	const offset = opts.offset ?? 0

	// ── Try LSS first (semantic search) ──────────────────────────────
	const lssHits = searchViaLss(opts.query, limit + 20) // fetch extra to compensate for post-filtering
	if (lssHits.length > 0) {
		const ids = lssHits.map((h) => h.id)
		let observations = getObservationIndexByIds(db, ids)

		// Apply post-filters on the SQLite-hydrated results
		if (opts.type) {
			observations = observations.filter((o) => o.type === opts.type)
		}
		if (opts.dateStart) {
			const startEpoch = new Date(opts.dateStart).getTime()
			observations = observations.filter((o) => o.createdAt >= startEpoch)
		}
		if (opts.dateEnd) {
			const endEpoch = new Date(opts.dateEnd).getTime() + 86400000
			observations = observations.filter((o) => o.createdAt <= endEpoch)
		}

		// Preserve LSS relevance ordering (ids came sorted by score)
		const idOrder = new Map(ids.map((id, i) => [id, i]))
		observations.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999))

		// Apply offset + limit
		const paged = observations.slice(offset, offset + limit)

		return { observations: paged, totalEstimate: observations.length }
	}

	// ── FTS5 fallback (keyword search) ───────────────────────────────
	return searchObservationsFts5(db, opts, limit, offset)
}

/**
 * FTS5-based observation search (fallback when LSS is unavailable).
 */
function searchObservationsFts5(
	db: Database,
	opts: SearchOptions,
	limit: number,
	offset: number,
): SearchResult {
	const orderBy = opts.orderBy ?? "date_desc"
	const ftsQuery = escapeFts5Query(opts.query)

	const params: Record<string, unknown> = { $query: ftsQuery }

	let typeFilter = ""
	let projectFilter = ""
	let dateFilter = ""

	if (opts.type) {
		typeFilter = `AND o.type = $type`
		params.$type = opts.type
	}

	if (opts.projectId) {
		projectFilter = `AND o.project_id = $projectId`
		params.$projectId = opts.projectId
	}

	if (opts.dateStart) {
		const startEpoch = new Date(opts.dateStart).getTime()
		dateFilter += `AND o.created_at >= $dateStart`
		params.$dateStart = startEpoch
	}

	if (opts.dateEnd) {
		const endEpoch = new Date(opts.dateEnd).getTime() + 86400000
		dateFilter += ` AND o.created_at <= $dateEnd`
		params.$dateEnd = endEpoch
	}

	let orderClause: string
	switch (orderBy) {
		case "relevance":
			orderClause = "ORDER BY rank"
			break
		case "date_asc":
			orderClause = "ORDER BY o.created_at ASC"
			break
		default:
			orderClause = "ORDER BY o.created_at DESC"
	}

	const sql = `
		SELECT o.id, o.type, o.title, o.tool_name, o.files_modified, o.created_at
		FROM observations_fts
		JOIN observations o ON o.id = observations_fts.rowid
		WHERE observations_fts MATCH $query
		${typeFilter} ${projectFilter} ${dateFilter}
		${orderClause}
		LIMIT $limit OFFSET $offset
	`

	params.$limit = limit
	params.$offset = offset

	try {
		const rows = db.prepare(sql).all(params as any) as Array<Record<string, unknown>>

		const observations: ObservationIndex[] = rows.map((row) => ({
			id: row.id as number,
			type: row.type as ObservationType,
			title: row.title as string,
			toolName: row.tool_name as string | null,
			filesModified: safeJsonParse(row.files_modified as string),
			createdAt: row.created_at as number,
		}))

		const countSql = `
			SELECT COUNT(*) as cnt
			FROM observations_fts
			JOIN observations o ON o.id = observations_fts.rowid
			WHERE observations_fts MATCH $query
			${typeFilter} ${projectFilter} ${dateFilter}
		`
		const countRow = db.prepare(countSql).get(params as any) as { cnt: number } | null
		const totalEstimate = countRow?.cnt ?? observations.length

		return { observations, totalEstimate }
	} catch (err) {
			return searchFallback(db, opts.query, limit, offset, opts)
	}
}

/**
 * Search session summaries using FTS5.
 */
export function searchSummaries(
	db: Database,
	query: string,
	limit: number = 10,
): SessionSummary[] {
	const ftsQuery = escapeFts5Query(query)

	try {
		const sql = `
			SELECT ss.*
			FROM summaries_fts
			JOIN session_summaries ss ON ss.id = summaries_fts.rowid
			WHERE summaries_fts MATCH $query
			ORDER BY ss.created_at DESC
			LIMIT $limit
		`

		const rows = db.prepare(sql).all({ $query: ftsQuery, $limit: limit }) as Array<
			Record<string, unknown>
		>
		return rows.map(rowToSummary)
	} catch {
		return []
	}
}

// =============================================================================
// LAYER 2: TIMELINE (Chronological Context)
// =============================================================================

/**
 * Get chronological context around a specific observation.
 * Returns observations before and after the anchor with medium detail.
 */
export function getTimelineAround(
	db: Database,
	anchorId: number,
	depthBefore: number = 5,
	depthAfter: number = 5,
): TimelineResult {
	depthBefore = Math.min(depthBefore, 20)
	depthAfter = Math.min(depthAfter, 20)

	// Get anchor timestamp
	const anchor = db
		.prepare(`SELECT id, created_at FROM observations WHERE id = $id`)
		.get({ $id: anchorId }) as { id: number; created_at: number } | null

	if (!anchor) return { observations: [], anchorIndex: -1 }

	// Before anchor (ordered newest-first, then reversed)
	const beforeRows = db
		.prepare(
			`SELECT id, type, title, subtitle, narrative, tool_name, files_read, files_modified, created_at
			 FROM observations
			 WHERE created_at <= $ts AND id < $id
			 ORDER BY created_at DESC, id DESC
			 LIMIT $limit`,
		)
		.all({ $ts: anchor.created_at, $id: anchorId, $limit: depthBefore }) as Array<
		Record<string, unknown>
	>

	// The anchor itself
	const anchorRow = db
		.prepare(
			`SELECT id, type, title, subtitle, narrative, tool_name, files_read, files_modified, created_at
			 FROM observations WHERE id = $id`,
		)
		.get({ $id: anchorId }) as Record<string, unknown> | null

	// After anchor
	const afterRows = db
		.prepare(
			`SELECT id, type, title, subtitle, narrative, tool_name, files_read, files_modified, created_at
			 FROM observations
			 WHERE created_at >= $ts AND id > $id
			 ORDER BY created_at ASC, id ASC
			 LIMIT $limit`,
		)
		.all({ $ts: anchor.created_at, $id: anchorId, $limit: depthAfter }) as Array<
		Record<string, unknown>
	>

	const toEntry = (row: Record<string, unknown>, isAnchor: boolean): TimelineEntry => ({
		id: row.id as number,
		type: row.type as ObservationType,
		title: row.title as string,
		subtitle: row.subtitle as string | null,
		narrative: row.narrative as string | null,
		toolName: row.tool_name as string | null,
		filesRead: safeJsonParse(row.files_read as string),
		filesModified: safeJsonParse(row.files_modified as string),
		createdAt: row.created_at as number,
		isAnchor,
	})

	const entries: TimelineEntry[] = [
		...beforeRows.reverse().map((r) => toEntry(r, false)),
		...(anchorRow ? [toEntry(anchorRow, true)] : []),
		...afterRows.map((r) => toEntry(r, false)),
	]

	const anchorIndex = anchorRow ? beforeRows.length : -1

	return { observations: entries, anchorIndex }
}

// =============================================================================
// LAYER 3: FULL DETAILS (via db.ts getObservationsByIds)
// =============================================================================

// Full detail fetching is handled by db.ts getObservationsByIds()
// This layer is just the search + timeline + batch-get workflow.

// =============================================================================
// FORMATTING (for tool output)
// =============================================================================

/**
 * Format search results as a compact markdown table.
 * Optimized for minimal token usage (~50-100 tokens per row).
 */
export function formatSearchResults(results: SearchResult): string {
	if (results.observations.length === 0) {
		return "No observations found matching your query."
	}

	const lines: string[] = [
		`Found ${results.totalEstimate} observations (showing ${results.observations.length}):`,
		"",
		"| ID | Time | Type | Title | Files |",
		"|---|---|---|---|---|",
	]

	for (const obs of results.observations) {
		const time = formatTime(obs.createdAt)
		const typeEmoji = TYPE_EMOJI[obs.type] || "?"
		const files = obs.filesModified.length > 0
			? obs.filesModified.map(basename).slice(0, 2).join(", ")
			: ""
		lines.push(`| #${obs.id} | ${time} | ${typeEmoji} | ${obs.title} | ${files} |`)
	}

	lines.push("")
	lines.push("Use `mem_timeline(anchor=ID)` for context, `mem_get(ids=[...])` for full details.")

	return lines.join("\n")
}

/**
 * Format timeline results as a chronological view.
 */
export function formatTimeline(result: TimelineResult): string {
	if (result.observations.length === 0) {
		return "No timeline data found for this observation."
	}

	const lines: string[] = ["## Timeline", ""]

	for (const entry of result.observations) {
		const time = formatTime(entry.createdAt)
		const typeEmoji = TYPE_EMOJI[entry.type] || "?"
		const marker = entry.isAnchor ? " **[ANCHOR]**" : ""
		const files = [
			...entry.filesRead.map((f) => `R:${basename(f)}`),
			...entry.filesModified.map((f) => `W:${basename(f)}`),
		]
			.slice(0, 3)
			.join(", ")

		lines.push(`**#${entry.id}** ${time} ${typeEmoji} ${entry.title}${marker}`)
		if (entry.subtitle) lines.push(`  ${entry.subtitle}`)
		if (entry.narrative) lines.push(`  ${entry.narrative.slice(0, 200)}`)
		if (files) lines.push(`  Files: ${files}`)
		lines.push("")
	}

	lines.push("Use `mem_get(ids=[...])` for full observation details.")
	return lines.join("\n")
}

/**
 * Format full observations for mem_get output.
 */
export function formatObservations(observations: Observation[]): string {
	if (observations.length === 0) return "No observations found for the given IDs."

	const sections: string[] = []

	for (const obs of observations) {
		const time = formatTime(obs.createdAt)
		const typeEmoji = TYPE_EMOJI[obs.type] || "?"

		const lines = [
			`## #${obs.id} — ${typeEmoji} ${obs.title}`,
			`**Time:** ${time} | **Type:** ${obs.type} | **Tool:** ${obs.toolName || "—"}`,
		]

		if (obs.subtitle) lines.push(`**Subtitle:** ${obs.subtitle}`)
		if (obs.narrative) lines.push("", obs.narrative)
		if (obs.facts.length > 0) {
			lines.push("", "**Facts:**")
			for (const fact of obs.facts) lines.push(`- ${fact}`)
		}
		if (obs.concepts.length > 0) {
			lines.push(`**Concepts:** ${obs.concepts.join(", ")}`)
		}
		if (obs.filesRead.length > 0) {
			lines.push(`**Files read:** ${obs.filesRead.join(", ")}`)
		}
		if (obs.filesModified.length > 0) {
			lines.push(`**Files modified:** ${obs.filesModified.join(", ")}`)
		}

		sections.push(lines.join("\n"))
	}

	return sections.join("\n\n---\n\n")
}

// =============================================================================
// HELPERS
// =============================================================================

const TYPE_EMOJI: Record<string, string> = {
	discovery: "\u{1F535}",  // blue circle
	decision: "\u{2696}",   // balance scale
	bugfix: "\u{1F534}",    // red circle
	feature: "\u{1F7E3}",   // purple circle
	refactor: "\u{1F504}",  // arrows cycle
	change: "\u{2705}",     // check mark
}

/**
 * Escape a user query for safe FTS5 usage.
 * Wraps each token in double quotes to prevent FTS5 syntax injection.
 */
function escapeFts5Query(query: string): string {
	if (!query || !query.trim()) return '""'

	// If user already uses FTS5 syntax (AND, OR, NOT, quotes), pass through
	if (/\b(AND|OR|NOT)\b/.test(query) || query.includes('"')) {
		return query
	}

	// Otherwise, wrap each word in quotes for safe literal matching
	return query
		.trim()
		.split(/\s+/)
		.map((word) => `"${word.replace(/"/g, '""')}"`)
		.join(" ")
}

/**
 * Fallback search using LIKE when FTS5 query fails.
 */
function searchFallback(
	db: Database,
	query: string,
	limit: number,
	offset: number,
	opts: SearchOptions,
): SearchResult {
	const likePattern = `%${query}%`
	const params: Record<string, unknown> = {
		$pattern: likePattern,
		$limit: limit,
		$offset: offset,
	}

	let filters = ""
	if (opts.type) {
		filters += ` AND type = $type`
		params.$type = opts.type
	}
	if (opts.projectId) {
		filters += ` AND project_id = $projectId`
		params.$projectId = opts.projectId
	}

	const sql = `
		SELECT id, type, title, tool_name, files_modified, created_at
		FROM observations
		WHERE (title LIKE $pattern OR narrative LIKE $pattern OR facts LIKE $pattern)
		${filters}
		ORDER BY created_at DESC
		LIMIT $limit OFFSET $offset
	`

	const rows = db.prepare(sql).all(params as any) as Array<Record<string, unknown>>
	const observations: ObservationIndex[] = rows.map((row) => ({
		id: row.id as number,
		type: row.type as ObservationType,
		title: row.title as string,
		toolName: row.tool_name as string | null,
		filesModified: safeJsonParse(row.files_modified as string),
		createdAt: row.created_at as number,
	}))

	return { observations, totalEstimate: observations.length }
}

function formatTime(epochMs: number): string {
	const d = new Date(epochMs)
	const month = d.toLocaleString("en-US", { month: "short" })
	const day = d.getDate()
	const hours = d.getHours().toString().padStart(2, "0")
	const mins = d.getMinutes().toString().padStart(2, "0")
	return `${month} ${day} ${hours}:${mins}`
}

function basename(filePath: string): string {
	const parts = filePath.split("/")
	return parts[parts.length - 1] || filePath
}

function safeJsonParse(text: string | null): string[] {
	if (!text) return []
	try {
		const parsed = JSON.parse(text)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function rowToSummary(row: Record<string, unknown>): SessionSummary {
	return {
		id: row.id as number,
		sessionId: row.session_id as string,
		projectId: row.project_id as string | null,
		request: row.request as string | null,
		investigated: row.investigated as string | null,
		learned: row.learned as string | null,
		completed: row.completed as string | null,
		nextSteps: row.next_steps as string | null,
		filesRead: safeJsonParse(row.files_read as string),
		filesModified: safeJsonParse(row.files_modified as string),
		createdAt: row.created_at as number,
		summarizedAt: (row.summarized_at as number) ?? null,
	}
}
