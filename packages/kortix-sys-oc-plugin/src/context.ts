/**
 * LTM Context Formatter
 *
 * Generates a compact <long-term-memory> reference index injected into
 * the latest user message (cache-safe — system prompt untouched).
 *
 * Format: recency-sorted entries grouped by type, each showing only
 * the ID, source session, and caption — NOT full content.
 * The agent uses mem_search to retrieve full details when needed.
 */

import type { Database } from "bun:sqlite"
import { getRecentLTM } from "./db"
import type { LTMEntry } from "./types"

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 40

// ─── Main Formatter ──────────────────────────────────────────────────────────

/**
 * Generate the compact LTM reference index for injection into a user message.
 * Returns empty string if no memories exist.
 *
 * Entries are sorted by recency (updated_at DESC) and grouped by type.
 * Each entry shows: [type] #id (session: ses_xxx) — caption
 */
export function generateLTMBlock(
	db: Database,
	limit?: number,
): string {
	const entries = getRecentLTM(db, limit ?? DEFAULT_LIMIT)
	if (entries.length === 0) return ""

	// Group by type, preserving recency order within each group
	const episodic: LTMEntry[] = []
	const semantic: LTMEntry[] = []
	const procedural: LTMEntry[] = []

	for (const e of entries) {
		switch (e.type) {
			case "episodic": episodic.push(e); break
			case "semantic": semantic.push(e); break
			case "procedural": procedural.push(e); break
		}
	}

	const sections: string[] = [
		"<long-term-memory>",
		"Reference index of your long-term memories (most recent first).",
		"Use mem_search to retrieve full details when needed.",
	]

	if (episodic.length > 0) {
		sections.push("")
		sections.push("## Episodic")
		for (const e of episodic) sections.push(formatRef(e))
	}

	if (semantic.length > 0) {
		sections.push("")
		sections.push("## Semantic")
		for (const s of semantic) sections.push(formatRef(s))
	}

	if (procedural.length > 0) {
		sections.push("")
		sections.push("## Procedural")
		for (const p of procedural) sections.push(formatRef(p))
	}

	sections.push("")
	sections.push("</long-term-memory>")

	return sections.join("\n")
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRef(entry: LTMEntry): string {
	const caption = entry.caption || entry.content.slice(0, 80)
	const session = entry.sourceSessionId
		? ` (${entry.sourceSessionId.slice(0, 12)})`
		: ""
	return `- #${entry.id}${session} — ${caption}`
}
