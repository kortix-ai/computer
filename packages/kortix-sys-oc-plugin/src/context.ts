/**
 * LTM Context Formatter
 *
 * Generates the <long-term-memory> block that gets injected into
 * the latest user message (cache-safe — system prompt untouched).
 *
 * Groups memories by type: Episodic → Semantic → Procedural.
 * Orders by most recently updated within each group.
 */

import type { Database } from "bun:sqlite"
import { getLTMByType } from "./db"
import type { LTMEntry } from "./types"

// ─── Configuration ───────────────────────────────────────────────────────────

export interface LTMBlockLimits {
	episodic?: number
	semantic?: number
	procedural?: number
}

const DEFAULT_LIMITS: Required<LTMBlockLimits> = {
	episodic: 10,
	semantic: 15,
	procedural: 10,
}

// ─── Main Formatter ──────────────────────────────────────────────────────────

/**
 * Generate the full LTM block for injection into a user message.
 * Returns empty string if no memories exist.
 */
export function generateLTMBlock(
	db: Database,
	limits?: LTMBlockLimits,
): string {
	const l = { ...DEFAULT_LIMITS, ...limits }

	const episodic = getLTMByType(db, "episodic", l.episodic)
	const semantic = getLTMByType(db, "semantic", l.semantic)
	const procedural = getLTMByType(db, "procedural", l.procedural)

	if (episodic.length === 0 && semantic.length === 0 && procedural.length === 0) {
		return ""
	}

	const sections: string[] = ["<long-term-memory>"]

	if (episodic.length > 0) {
		sections.push("")
		sections.push("## Episodic (what happened)")
		for (const e of episodic) {
			sections.push(formatEntry(e))
		}
	}

	if (semantic.length > 0) {
		sections.push("")
		sections.push("## Semantic (what I know)")
		for (const s of semantic) {
			sections.push(formatEntry(s))
		}
	}

	if (procedural.length > 0) {
		sections.push("")
		sections.push("## Procedural (how to do things)")
		for (const p of procedural) {
			sections.push(formatEntry(p))
		}
	}

	sections.push("")
	sections.push("</long-term-memory>")

	return sections.join("\n")
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEntry(entry: LTMEntry): string {
	const date = formatDate(entry.createdAt)
	const files = entry.files.length > 0
		? ` [${entry.files.map(basename).slice(0, 2).join(", ")}]`
		: ""
	return `- ${entry.content}${files}`
}

function formatDate(dateStr: string): string {
	try {
		const d = new Date(dateStr)
		if (isNaN(d.getTime())) return ""
		return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
	} catch {
		return ""
	}
}

function basename(filePath: string): string {
	const parts = filePath.split("/")
	return parts[parts.length - 1] || filePath
}
