/**
 * Memory Context Formatter
 *
 * Generates the <memory-context> block appended at the prompt tail so it stays
 * out of the stable cached prefix.
 *
 * Three sections:
 *   1. Recent observations table — compact index of tool execution history
 *   2. Long-term memories — consolidated knowledge highlights
 *   3. Recent session timeline — what the user was working on recently
 *
 * The agent uses observation_search / ltm_search / get_mem for full details.
 */

import type { Database } from "bun:sqlite"
import { getRecentObservations, getRecentLTMCompact, getRecentSessions } from "./db"
import type { ObservationType, LTMType } from "./types"

// ─── Configuration ───────────────────────────────────────────────────────────

const OBS_LIMIT = 50
const LTM_LIMIT = 20
const SESSION_LIMIT = 8

const TYPE_EMOJI: Record<string, string> = {
	discovery: "🔵",
	decision: "⚖️",
	bugfix: "🔴",
	feature: "🟣",
	refactor: "🔄",
	change: "✅",
}

const LTM_TYPE_LABEL: Record<string, string> = {
	episodic: "E",
	semantic: "S",
	procedural: "P",
}

// ─── Main Formatter ──────────────────────────────────────────────────────────

export interface ContextBlockOptions {
	/** Current project ID for scoped results */
	projectId?: string
	/** Current session ID to exclude from timeline */
	currentSessionId?: string
}

/**
 * Generate the full memory context block for injection.
 * Returns empty string if no data exists.
 */
export function generateContextBlock(
	db: Database,
	opts?: ContextBlockOptions,
): string {
	const sections: string[] = []

	// ── Section 1: Recent observations ────────────────────────────────
	const observations = getRecentObservations(db, OBS_LIMIT)
	if (observations.length > 0) {
		const obsLines: string[] = [
			"Recent observations (most recent first). Use observation_search/ltm_search/get_mem for details.",
			"",
			"| ID | Session | T | Title |",
			"|----|---------|---|-------|",
		]
		for (const e of observations) {
			const title = e.title.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80)
			const emoji = TYPE_EMOJI[e.type] ?? "❓"
			const session = e.sessionId ? e.sessionId.slice(0, 12) : "—"
			obsLines.push(`| #${e.id} | ${session} | ${emoji} | ${title} |`)
		}
		sections.push(obsLines.join("\n"))
	}

	// ── Section 2: Long-term memories ─────────────────────────────────
	const ltmEntries = getRecentLTMCompact(db, {
		limit: LTM_LIMIT,
		projectId: opts?.projectId,
	})
	if (ltmEntries.length > 0) {
		const ltmLines: string[] = [
			"Long-term memories (consolidated knowledge). Use ltm_search/get_mem for full details.",
			"",
		]
		// Group by type for readability
		const byType: Record<string, typeof ltmEntries> = {}
		for (const entry of ltmEntries) {
			const t = entry.type
			if (!byType[t]) byType[t] = []
			byType[t].push(entry)
		}
		for (const type of ["semantic", "procedural", "episodic"] as const) {
			const entries = byType[type]
			if (!entries?.length) continue
			const label = type.charAt(0).toUpperCase() + type.slice(1)
			ltmLines.push(`**${label}:**`)
			for (const e of entries) {
				const caption = (e.caption || e.content.slice(0, 80)).replace(/\n/g, " ")
				ltmLines.push(`- [#${e.id}] ${caption}`)
			}
			ltmLines.push("")
		}
		sections.push(ltmLines.join("\n"))
	}

	// ── Section 3: Recent session timeline ────────────────────────────
	const sessions = getRecentSessions(db, {
		projectId: opts?.projectId,
		limit: SESSION_LIMIT,
		excludeSessionId: opts?.currentSessionId,
	})
	if (sessions.length > 0) {
		const sessLines: string[] = [
			"Recent sessions (what you were working on):",
			"",
		]
		for (const s of sessions) {
			const title = s.title || "(untitled)"
			const date = s.startedAt?.slice(0, 16).replace("T", " ") ?? "?"
			const obs = s.observationCount
			const status = s.status === "completed" ? "done" : "active"
			sessLines.push(`- ${date} | ${title} | ${obs} obs | ${status}`)
		}
		sections.push(sessLines.join("\n"))
	}

	if (sections.length === 0) return ""

	return [
		"<memory-context>",
		...sections,
		"",
		"</memory-context>",
	].join("\n")
}
