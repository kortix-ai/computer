/**
 * LSS (Local Semantic Search) Integration for Memory Plugin
 *
 * Bridges the memory plugin's SQLite observations with the lss-sync
 * file-watcher service. Observations and summaries are written as
 * markdown files so lss-sync auto-indexes them for semantic search.
 *
 * Search flow:
 *   1. mem_search query → lss CLI (BM25 + embeddings)
 *   2. Parse hit file paths → extract observation IDs
 *   3. Fetch full data from SQLite
 *
 * Fallback: If LSS is unavailable, search.ts falls back to FTS5.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import * as path from "node:path"
import * as os from "node:os"
import type { Observation, SessionSummary } from "./db"

// =============================================================================
// CONFIGURATION
// =============================================================================

const MEM_DIR = path.join(os.homedir(), ".kortix", "mem")
const LSS_TIMEOUT_MS = 15_000

// =============================================================================
// DIRECTORY SETUP
// =============================================================================

/**
 * Ensure the /workspace/.kortix/mem/ directory exists.
 * Called once on plugin init.
 */
export function ensureMemDir(): void {
	mkdirSync(MEM_DIR, { recursive: true })
}

// =============================================================================
// FILE WRITING
// =============================================================================

/**
 * Write (or overwrite) a companion markdown file for an observation.
 * Called after insertObservation() and again after AI enrichment.
 * lss-sync auto-indexes the file via inotify.
 */
export function writeObservationFile(obs: Observation): void {
	const filename = `obs_${obs.id}.md`
	const filePath = path.join(MEM_DIR, filename)

	const lines: string[] = [
		`# [${obs.type}] ${obs.title}`,
		"",
	]

	if (obs.subtitle) lines.push(obs.subtitle, "")
	if (obs.narrative) lines.push(obs.narrative, "")

	if (obs.facts.length > 0) {
		lines.push(`Facts: ${obs.facts.join("; ")}`, "")
	}
	if (obs.concepts.length > 0) {
		lines.push(`Concepts: ${obs.concepts.join(", ")}`, "")
	}
	if (obs.filesRead.length > 0) {
		lines.push(`Files read: ${obs.filesRead.join(", ")}`, "")
	}
	if (obs.filesModified.length > 0) {
		lines.push(`Files modified: ${obs.filesModified.join(", ")}`, "")
	}
	if (obs.toolName) {
		lines.push(`Tool: ${obs.toolName}`, "")
	}

	const date = new Date(obs.createdAt).toISOString().replace("T", " ").slice(0, 16)
	lines.push(`Session: ${obs.sessionId.slice(0, 12)} | Prompt: ${obs.promptNumber ?? "?"} | ${date}`)

	writeFileSync(filePath, lines.join("\n"), "utf-8")
}

/**
 * Write a companion markdown file for a session summary.
 * Called after upsertSummary().
 */
export function writeSummaryFile(sessionId: string, summary: SessionSummary): void {
	const prefix = sessionId.slice(0, 16).replace(/[^a-zA-Z0-9_-]/g, "_")
	const filename = `sum_${prefix}.md`
	const filePath = path.join(MEM_DIR, filename)

	const lines: string[] = [
		`# Session Summary: ${prefix}`,
		"",
	]

	if (summary.request) lines.push(`## Request\n${summary.request}`, "")
	if (summary.investigated) lines.push(`## Investigated\n${summary.investigated}`, "")
	if (summary.learned) lines.push(`## Learned\n${summary.learned}`, "")
	if (summary.completed) lines.push(`## Completed\n${summary.completed}`, "")
	if (summary.nextSteps) lines.push(`## Next Steps\n${summary.nextSteps}`, "")

	if (summary.filesRead.length > 0) {
		lines.push(`Files read: ${summary.filesRead.join(", ")}`, "")
	}
	if (summary.filesModified.length > 0) {
		lines.push(`Files modified: ${summary.filesModified.join(", ")}`, "")
	}

	const date = new Date(summary.createdAt).toISOString().replace("T", " ").slice(0, 16)
	lines.push(`Date: ${date}`)

	writeFileSync(filePath, lines.join("\n"), "utf-8")
}

// =============================================================================
// SEARCH
// =============================================================================

export interface LssSearchHit {
	id: number
	score: number
	snippet: string
}

/**
 * Search observations via LSS CLI (semantic + BM25 hybrid).
 * Scoped to /workspace/.kortix/mem/ — only searches observation/summary files.
 *
 * Returns observation IDs extracted from filenames (obs_{id}.md → id).
 * Returns empty array if LSS is unavailable or fails.
 */		
export function searchViaLss(query: string, limit: number = 20): LssSearchHit[] {
	try {
		const escaped = query.replace(/'/g, "'\\''")
		const k = Math.min(limit, 50)

		const result = execSync(
			`lss '${escaped}' -p '${MEM_DIR}' --json -k ${k} --no-index 2>/dev/null || lss '${escaped}' -p '${MEM_DIR}' --json -k ${k} 2>/dev/null`,
			{ timeout: LSS_TIMEOUT_MS, encoding: "utf-8", maxBuffer: 1024 * 1024 },
		)

		if (!result.trim()) return []

		const parsed = JSON.parse(result.trim())

		// LSS returns array of response objects (one per query)
		let hits: Array<{ file_path: string; score: number; snippet: string }> = []
		if (Array.isArray(parsed) && parsed.length > 0) {
			hits = parsed[0]?.hits ?? []
		} else if (parsed.hits) {
			hits = parsed.hits
		}

		// Extract observation IDs from filenames
		const results: LssSearchHit[] = []
		for (const hit of hits) {
			const basename = path.basename(hit.file_path)
			const match = basename.match(/^obs_(\d+)\.md$/)
			if (match?.[1]) {
				results.push({
					id: parseInt(match[1], 10),
					score: hit.score,
					snippet: hit.snippet,
				})
			}
			// Skip summary files (sum_*.md) — we only return observation IDs
		}

		return results
	} catch {
		// LSS unavailable, binary not found, timeout, etc.
		return []
	}
}
