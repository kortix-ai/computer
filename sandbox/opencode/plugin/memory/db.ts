/**
 * SQLite Database Layer for Memory Plugin
 *
 * Provides persistent storage for observations, sessions, and summaries.
 * Uses bun:sqlite with FTS5 full-text search for efficient retrieval.
 *
 * Database location: /workspace/.kortix/mem.db
 * (Co-located with existing .kortix/ memory system)
 *
 * Follows the exact patterns from plugin/worktree/state.ts:
 * - WAL mode for concurrent access
 * - Prepared statements for performance
 * - Zod validation at boundaries
 */

import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { z } from "zod"

// =============================================================================
// TYPES
// =============================================================================

export interface Session {
	id: string
	projectId: string | null
	status: "active" | "completed"
	promptCount: number
	createdAt: number // epoch ms
	completedAt: number | null
}

export interface Observation {
	id: number
	sessionId: string
	projectId: string | null
	type: ObservationType
	title: string
	subtitle: string | null
	narrative: string | null
	facts: string[] // stored as JSON
	concepts: string[] // stored as JSON
	filesRead: string[] // stored as JSON
	filesModified: string[] // stored as JSON
	toolName: string | null
	toolInputPreview: string | null
	promptNumber: number | null
	createdAt: number // epoch ms
}

export interface SessionSummary {
	id: number
	sessionId: string
	projectId: string | null
	request: string | null
	investigated: string | null
	learned: string | null
	completed: string | null
	nextSteps: string | null
	filesRead: string[] // stored as JSON
	filesModified: string[] // stored as JSON
	createdAt: number // epoch ms
	summarizedAt: number | null // epoch ms — when AI summary was last generated
}

export type ObservationType =
	| "discovery"
	| "decision"
	| "bugfix"
	| "feature"
	| "refactor"
	| "change"

// Compact index row returned by search (minimal tokens)
export interface ObservationIndex {
	id: number
	type: ObservationType
	title: string
	toolName: string | null
	filesModified: string[]
	createdAt: number
}

// =============================================================================
// SCHEMAS (Boundary Validation)
// =============================================================================

export const observationTypeSchema = z.enum([
	"discovery",
	"decision",
	"bugfix",
	"feature",
	"refactor",
	"change",
])

const createObservationSchema = z.object({
	sessionId: z.string().min(1),
	projectId: z.string().nullable().default(null),
	type: observationTypeSchema,
	title: z.string().min(1),
	subtitle: z.string().nullable().default(null),
	narrative: z.string().nullable().default(null),
	facts: z.array(z.string()).default([]),
	concepts: z.array(z.string()).default([]),
	filesRead: z.array(z.string()).default([]),
	filesModified: z.array(z.string()).default([]),
	toolName: z.string().nullable().default(null),
	toolInputPreview: z.string().nullable().default(null),
	promptNumber: z.number().nullable().default(null),
})

export type CreateObservationInput = z.infer<typeof createObservationSchema>

const createSummarySchema = z.object({
	sessionId: z.string().min(1),
	projectId: z.string().nullable().default(null),
	request: z.string().nullable().default(null),
	investigated: z.string().nullable().default(null),
	learned: z.string().nullable().default(null),
	completed: z.string().nullable().default(null),
	nextSteps: z.string().nullable().default(null),
	filesRead: z.array(z.string()).default([]),
	filesModified: z.array(z.string()).default([]),
})

export type CreateSummaryInput = z.infer<typeof createSummarySchema>

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/**
 * Get the database file path.
 * Location: /workspace/.kortix/mem.db (or $HOME/.kortix/mem.db)
 */
function getDbPath(): string {
	const home = os.homedir()
	return path.join(home, ".kortix", "mem.db")
}

/**
 * Initialize the SQLite database with schema and FTS5.
 * Creates database file and all tables if they don't exist.
 *
 * @returns Configured Database instance
 */
export function initMemDb(): Database {
	const dbPath = getDbPath()
	const dbDir = path.dirname(dbPath)

	// Create directory if needed
	mkdirSync(dbDir, { recursive: true })

	const db = new Database(dbPath)

	// Configure for concurrent access
	db.exec("PRAGMA journal_mode=WAL")
	db.exec("PRAGMA busy_timeout=5000")

	// ── Core Tables ────────────────────────────────────────────────────

	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			project_id TEXT,
			status TEXT NOT NULL DEFAULT 'active',
			prompt_count INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			completed_at INTEGER
		)
	`)

	db.exec(`
		CREATE TABLE IF NOT EXISTS observations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL REFERENCES sessions(id),
			project_id TEXT,
			type TEXT NOT NULL,
			title TEXT NOT NULL,
			subtitle TEXT,
			narrative TEXT,
			facts TEXT DEFAULT '[]',
			concepts TEXT DEFAULT '[]',
			files_read TEXT DEFAULT '[]',
			files_modified TEXT DEFAULT '[]',
			tool_name TEXT,
			tool_input_preview TEXT,
			prompt_number INTEGER,
			created_at INTEGER NOT NULL
		)
	`)

	db.exec(`
		CREATE TABLE IF NOT EXISTS session_summaries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
			project_id TEXT,
			request TEXT,
			investigated TEXT,
			learned TEXT,
			completed TEXT,
			next_steps TEXT,
			files_read TEXT DEFAULT '[]',
			files_modified TEXT DEFAULT '[]',
			created_at INTEGER NOT NULL
		)
	`)

	// ── Migrations ────────────────────────────────────────────────────
	// Add summarized_at column (idempotent — silently fails if already exists)
	try {
		db.exec(`ALTER TABLE session_summaries ADD COLUMN summarized_at INTEGER`)
	} catch {
		// Column already exists — expected after first run
	}

	// ── Indexes ────────────────────────────────────────────────────────

	db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id)`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project_id)`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at DESC)`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)`)
	db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`)

	// ── FTS5 Virtual Tables ────────────────────────────────────────────

	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
			title, subtitle, narrative, facts, concepts,
			content='observations', content_rowid='id'
		)
	`)

	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts USING fts5(
			request, investigated, learned, completed, next_steps,
			content='session_summaries', content_rowid='id'
		)
	`)

	// ── FTS5 Auto-Sync Triggers ────────────────────────────────────────
	// These keep FTS5 indexes synchronized with the source tables.

	// Observations FTS sync
	db.exec(`
		CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
			INSERT INTO observations_fts(rowid, title, subtitle, narrative, facts, concepts)
			VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
		END
	`)

	db.exec(`
		CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
			INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, facts, concepts)
			VALUES ('delete', old.id, old.title, old.subtitle, old.narrative, old.facts, old.concepts);
		END
	`)

	db.exec(`
		CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
			INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, facts, concepts)
			VALUES ('delete', old.id, old.title, old.subtitle, old.narrative, old.facts, old.concepts);
			INSERT INTO observations_fts(rowid, title, subtitle, narrative, facts, concepts)
			VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
		END
	`)

	// Summaries FTS sync
	db.exec(`
		CREATE TRIGGER IF NOT EXISTS summaries_ai AFTER INSERT ON session_summaries BEGIN
			INSERT INTO summaries_fts(rowid, request, investigated, learned, completed, next_steps)
			VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps);
		END
	`)

	db.exec(`
		CREATE TRIGGER IF NOT EXISTS summaries_ad AFTER DELETE ON session_summaries BEGIN
			INSERT INTO summaries_fts(summaries_fts, rowid, request, investigated, learned, completed, next_steps)
			VALUES ('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps);
		END
	`)

	db.exec(`
		CREATE TRIGGER IF NOT EXISTS summaries_au AFTER UPDATE ON session_summaries BEGIN
			INSERT INTO summaries_fts(summaries_fts, rowid, request, investigated, learned, completed, next_steps)
			VALUES ('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps);
			INSERT INTO summaries_fts(rowid, request, investigated, learned, completed, next_steps)
			VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps);
		END
	`)

	return db
}

// =============================================================================
// SESSION CRUD
// =============================================================================

/**
 * Create or get a session (idempotent via INSERT OR IGNORE).
 * Same session_id always returns without error.
 */
export function createSession(
	db: Database,
	sessionId: string,
	projectId: string | null = null,
): void {
	const stmt = db.prepare(`
		INSERT OR IGNORE INTO sessions (id, project_id, status, prompt_count, created_at)
		VALUES ($id, $projectId, 'active', 0, $createdAt)
	`)
	stmt.run({
		$id: sessionId,
		$projectId: projectId,
		$createdAt: Date.now(),
	})
}

/**
 * Increment the prompt counter for a session.
 */
export function incrementPromptCount(db: Database, sessionId: string): number {
	db.prepare(`UPDATE sessions SET prompt_count = prompt_count + 1 WHERE id = $id`).run({
		$id: sessionId,
	})
	const row = db.prepare(`SELECT prompt_count FROM sessions WHERE id = $id`).get({
		$id: sessionId,
	}) as { prompt_count: number } | null
	return row?.prompt_count ?? 0
}

/**
 * Mark a session as completed.
 */
export function completeSession(db: Database, sessionId: string): void {
	db.prepare(`UPDATE sessions SET status = 'completed', completed_at = $now WHERE id = $id`).run({
		$id: sessionId,
		$now: Date.now(),
	})
}

/**
 * Get a session by ID.
 */
export function getSession(db: Database, sessionId: string): Session | null {
	if (!sessionId) return null
	const row = db
		.prepare(
			`SELECT id, project_id, status, prompt_count, created_at, completed_at
		 FROM sessions WHERE id = $id`,
		)
		.get({ $id: sessionId }) as Record<string, unknown> | null
	if (!row) return null
	return {
		id: row.id as string,
		projectId: row.project_id as string | null,
		status: row.status as "active" | "completed",
		promptCount: row.prompt_count as number,
		createdAt: row.created_at as number,
		completedAt: row.completed_at as number | null,
	}
}

// =============================================================================
// OBSERVATION CRUD
// =============================================================================

/**
 * Insert a new observation. Returns the auto-generated ID.
 * Validates input with Zod at the boundary.
 */
export function insertObservation(db: Database, input: CreateObservationInput): number {
	const parsed = createObservationSchema.parse(input)

	const stmt = db.prepare(`
		INSERT INTO observations (
			session_id, project_id, type, title, subtitle, narrative,
			facts, concepts, files_read, files_modified,
			tool_name, tool_input_preview, prompt_number, created_at
		) VALUES (
			$sessionId, $projectId, $type, $title, $subtitle, $narrative,
			$facts, $concepts, $filesRead, $filesModified,
			$toolName, $toolInputPreview, $promptNumber, $createdAt
		)
	`)

	const result = stmt.run({
		$sessionId: parsed.sessionId,
		$projectId: parsed.projectId,
		$type: parsed.type,
		$title: parsed.title,
		$subtitle: parsed.subtitle,
		$narrative: parsed.narrative,
		$facts: JSON.stringify(parsed.facts),
		$concepts: JSON.stringify(parsed.concepts),
		$filesRead: JSON.stringify(parsed.filesRead),
		$filesModified: JSON.stringify(parsed.filesModified),
		$toolName: parsed.toolName,
		$toolInputPreview: parsed.toolInputPreview,
		$promptNumber: parsed.promptNumber,
		$createdAt: Date.now(),
	})

	return Number(result.lastInsertRowid)
}

/**
 * Get a single observation by ID (full details).
 */
export function getObservationById(db: Database, id: number): Observation | null {
	const row = db
		.prepare(`SELECT * FROM observations WHERE id = $id`)
		.get({ $id: id }) as Record<string, unknown> | null
	if (!row) return null
	return rowToObservation(row)
}

/**
 * Get observations by IDs (batch fetch for mem_get tool).
 */
export function getObservationsByIds(db: Database, ids: number[]): Observation[] {
	if (ids.length === 0) return []
	const placeholders = ids.map(() => "?").join(",")
	const rows = db
		.prepare(`SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at ASC`)
		.all(...ids) as Array<Record<string, unknown>>
	return rows.map(rowToObservation)
}

/**
 * Get compact observation index entries by IDs (for hydrating LSS search results).
 */
export function getObservationIndexByIds(db: Database, ids: number[]): ObservationIndex[] {
	if (ids.length === 0) return []
	const placeholders = ids.map(() => "?").join(",")
	const rows = db
		.prepare(
			`SELECT id, type, title, tool_name, files_modified, created_at
			 FROM observations WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
		)
		.all(...ids) as Array<Record<string, unknown>>
	return rows.map((row) => ({
		id: row.id as number,
		type: row.type as ObservationType,
		title: row.title as string,
		toolName: row.tool_name as string | null,
		filesModified: safeJsonParse(row.files_modified as string),
		createdAt: row.created_at as number,
	}))
}

/**
 * Get recent observations as compact index (for context injection).
 */
export function getRecentObservations(
	db: Database,
	limit: number = 30,
	projectId?: string,
): ObservationIndex[] {
	let sql = `SELECT id, type, title, tool_name, files_modified, created_at
		FROM observations`
	const params: Record<string, unknown> = {}

	if (projectId) {
		sql += ` WHERE project_id = $projectId`
		params.$projectId = projectId
	}

	sql += ` ORDER BY created_at DESC LIMIT $limit`
	params.$limit = limit

	const rows = db.prepare(sql).all(params as any) as Array<Record<string, unknown>>
	return rows.map((row) => ({
		id: row.id as number,
		type: row.type as ObservationType,
		title: row.title as string,
		toolName: row.tool_name as string | null,
		filesModified: safeJsonParse(row.files_modified as string),
		createdAt: row.created_at as number,
	}))
}

/**
 * Get observations around an anchor (for timeline view).
 */
export function getTimeline(
	db: Database,
	anchorId: number,
	depthBefore: number = 5,
	depthAfter: number = 5,
): Observation[] {
	// Get the anchor's timestamp
	const anchor = db
		.prepare(`SELECT created_at FROM observations WHERE id = $id`)
		.get({ $id: anchorId }) as { created_at: number } | null
	if (!anchor) return []

	// Get observations before
	const before = db
		.prepare(
			`SELECT * FROM observations
			 WHERE created_at <= $ts AND id != $id
			 ORDER BY created_at DESC LIMIT $limit`,
		)
		.all({ $ts: anchor.created_at, $id: anchorId, $limit: depthBefore }) as Array<
		Record<string, unknown>
	>

	// Get the anchor itself
	const anchorRow = db
		.prepare(`SELECT * FROM observations WHERE id = $id`)
		.get({ $id: anchorId }) as Record<string, unknown> | null

	// Get observations after
	const after = db
		.prepare(
			`SELECT * FROM observations
			 WHERE created_at >= $ts AND id != $id
			 ORDER BY created_at ASC LIMIT $limit`,
		)
		.all({ $ts: anchor.created_at, $id: anchorId, $limit: depthAfter }) as Array<
		Record<string, unknown>
	>

	const results = [...before.reverse(), ...(anchorRow ? [anchorRow] : []), ...after]
	return results.map(rowToObservation)
}

/**
 * Update an existing observation with AI-enriched fields.
 * Also triggers FTS5 re-sync via the observations_au trigger.
 */
export function updateObservation(
	db: Database,
	id: number,
	fields: {
		type?: ObservationType
		title?: string
		subtitle?: string | null
		narrative?: string | null
		facts?: string[]
		concepts?: string[]
		filesRead?: string[]
		filesModified?: string[]
	},
): void {
	const sets: string[] = []
	const params: Record<string, unknown> = { $id: id }

	if (fields.type !== undefined) {
		sets.push("type = $type")
		params.$type = fields.type
	}
	if (fields.title !== undefined) {
		sets.push("title = $title")
		params.$title = fields.title
	}
	if (fields.subtitle !== undefined) {
		sets.push("subtitle = $subtitle")
		params.$subtitle = fields.subtitle
	}
	if (fields.narrative !== undefined) {
		sets.push("narrative = $narrative")
		params.$narrative = fields.narrative
	}
	if (fields.facts !== undefined) {
		sets.push("facts = $facts")
		params.$facts = JSON.stringify(fields.facts)
	}
	if (fields.concepts !== undefined) {
		sets.push("concepts = $concepts")
		params.$concepts = JSON.stringify(fields.concepts)
	}
	if (fields.filesRead !== undefined) {
		sets.push("files_read = $filesRead")
		params.$filesRead = JSON.stringify(fields.filesRead)
	}
	if (fields.filesModified !== undefined) {
		sets.push("files_modified = $filesModified")
		params.$filesModified = JSON.stringify(fields.filesModified)
	}

	if (sets.length === 0) return

	const sql = `UPDATE observations SET ${sets.join(", ")} WHERE id = $id`
	db.prepare(sql).run(params as any)
}

/**
 * Get all observations for a session (for AI summary generation).
 */
export function getObservationsBySessionId(db: Database, sessionId: string): Observation[] {
	const rows = db
		.prepare(`SELECT * FROM observations WHERE session_id = $sessionId ORDER BY created_at ASC`)
		.all({ $sessionId: sessionId }) as Array<Record<string, unknown>>
	return rows.map(rowToObservation)
}

// =============================================================================
// SUMMARY CRUD
// =============================================================================

/**
 * Insert or replace a session summary.
 */
export function upsertSummary(db: Database, input: CreateSummaryInput): number {
	const parsed = createSummarySchema.parse(input)

	const stmt = db.prepare(`
		INSERT OR REPLACE INTO session_summaries (
			session_id, project_id, request, investigated, learned,
			completed, next_steps, files_read, files_modified, created_at, summarized_at
		) VALUES (
			$sessionId, $projectId, $request, $investigated, $learned,
			$completed, $nextSteps, $filesRead, $filesModified, $createdAt, $summarizedAt
		)
	`)

	const now = Date.now()
	const result = stmt.run({
		$sessionId: parsed.sessionId,
		$projectId: parsed.projectId,
		$request: parsed.request,
		$investigated: parsed.investigated,
		$learned: parsed.learned,
		$completed: parsed.completed,
		$nextSteps: parsed.nextSteps,
		$filesRead: JSON.stringify(parsed.filesRead),
		$filesModified: JSON.stringify(parsed.filesModified),
		$createdAt: now,
		$summarizedAt: now,
	})

	return Number(result.lastInsertRowid)
}

/**
 * Get recent session summaries.
 */
export function getRecentSummaries(
	db: Database,
	limit: number = 5,
	projectId?: string,
): SessionSummary[] {
	let sql = `SELECT * FROM session_summaries`
	const params: Record<string, unknown> = {}

	if (projectId) {
		sql += ` WHERE project_id = $projectId`
		params.$projectId = projectId
	}

	sql += ` ORDER BY created_at DESC LIMIT $limit`
	params.$limit = limit

	const rows = db.prepare(sql).all(params as any) as Array<Record<string, unknown>>
	return rows.map(rowToSummary)
}

/**
 * Get an existing summary for a session (for incremental enrichment check).
 */
export function getSummaryBySessionId(db: Database, sessionId: string): SessionSummary | null {
	const row = db
		.prepare(`SELECT * FROM session_summaries WHERE session_id = $sessionId`)
		.get({ $sessionId: sessionId }) as Record<string, unknown> | null
	if (!row) return null
	return rowToSummary(row)
}

/**
 * Get observations for a session created after a given timestamp.
 * Used to fetch only "new" observations for incremental summary enrichment.
 */
export function getObservationsBySessionIdSince(
	db: Database,
	sessionId: string,
	sinceEpochMs: number,
): Observation[] {
	const rows = db
		.prepare(
			`SELECT * FROM observations
			 WHERE session_id = $sessionId AND created_at > $since
			 ORDER BY created_at ASC`,
		)
		.all({ $sessionId: sessionId, $since: sinceEpochMs }) as Array<Record<string, unknown>>
	return rows.map(rowToObservation)
}

// =============================================================================
// HELPERS
// =============================================================================

function safeJsonParse(text: string | null): string[] {
	if (!text) return []
	try {
		const parsed = JSON.parse(text)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function rowToObservation(row: Record<string, unknown>): Observation {
	return {
		id: row.id as number,
		sessionId: row.session_id as string,
		projectId: row.project_id as string | null,
		type: row.type as ObservationType,
		title: row.title as string,
		subtitle: row.subtitle as string | null,
		narrative: row.narrative as string | null,
		facts: safeJsonParse(row.facts as string),
		concepts: safeJsonParse(row.concepts as string),
		filesRead: safeJsonParse(row.files_read as string),
		filesModified: safeJsonParse(row.files_modified as string),
		toolName: row.tool_name as string | null,
		toolInputPreview: row.tool_input_preview as string | null,
		promptNumber: row.prompt_number as number | null,
		createdAt: row.created_at as number,
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
