/**
 * Context Injection Formatter for Memory Plugin
 *
 * Formats recent observations and session summaries as markdown
 * for injection into the LLM's system context.
 *
 * Mirrors claude-mem's SessionStart context format:
 * - Compact table with observation IDs, timestamps, types, titles
 * - Token estimates for each entry
 * - Grouped by date
 * - Session summaries section
 *
 * The output enables the 3-layer progressive disclosure pattern:
 * Claude sees the index, then can drill into specific observations
 * using mem_timeline and mem_get tools.
 */

import type { Database } from "bun:sqlite"
import { getRecentObservations, getRecentSummaries } from "./db"
import type { ObservationIndex, SessionSummary } from "./db"

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_OBSERVATION_COUNT = 30
const DEFAULT_SUMMARY_COUNT = 5

// =============================================================================
// MAIN FORMATTER
// =============================================================================

/**
 * Generate the full context injection block for system prompt.
 *
 * @param db - Database instance
 * @param projectId - Optional project filter
 * @param observationCount - Number of recent observations to include
 * @param summaryCount - Number of recent session summaries to include
 * @returns Formatted markdown context string
 */
export function generateContextBlock(
	db: Database,
	projectId?: string,
	observationCount: number = DEFAULT_OBSERVATION_COUNT,
	summaryCount: number = DEFAULT_SUMMARY_COUNT,
): string {
	const observations = getRecentObservations(db, observationCount, projectId)
	const summaries = getRecentSummaries(db, summaryCount, projectId)

	// If nothing to show, return empty
	if (observations.length === 0 && summaries.length === 0) {
		return ""
	}

	const sections: string[] = [
		"<mem-context>",
		"# Recent Observation Memory",
		"",
		"This is your automatic observation history. Use `mem_search`, `mem_timeline`, and `mem_get` tools to explore past work in detail.",
		"",
	]

	// Observation index table
	if (observations.length > 0) {
		sections.push(formatObservationTable(observations))
	}

	// Session summaries
	if (summaries.length > 0) {
		sections.push(formatSummariesSection(summaries))
	}

	// Token budget note
	const totalObs = observations.length
	const tokenEstimate = totalObs * 75 + summaries.length * 200 // rough estimate
	sections.push("")
	sections.push(`*${totalObs} observations, ${summaries.length} summaries (~${tokenEstimate} tokens)*`)
	sections.push("</mem-context>")

	return sections.join("\n")
}

// =============================================================================
// OBSERVATION TABLE
// =============================================================================

function formatObservationTable(observations: ObservationIndex[]): string {
	// Group by date
	const grouped = groupByDate(observations)
	const lines: string[] = []

	for (const [date, obs] of grouped) {
		lines.push(`### ${date}`)
		lines.push("")
		lines.push("| ID | Time | T | Title | Files |")
		lines.push("|---|---|---|---|---|")

		for (const o of obs) {
			const time = formatTime(o.createdAt)
			const emoji = TYPE_EMOJI[o.type] || "?"
			const files = o.filesModified.length > 0
				? o.filesModified.map(basename).slice(0, 2).join(", ")
				: ""
			lines.push(`| #${o.id} | ${time} | ${emoji} | ${truncate(o.title, 60)} | ${files} |`)
		}

		lines.push("")
	}

	return lines.join("\n")
}

// =============================================================================
// SESSION SUMMARIES
// =============================================================================

function formatSummariesSection(summaries: SessionSummary[]): string {
	const lines: string[] = [
		"### Recent Sessions",
		"",
	]

	for (const s of summaries) {
		const date = formatDate(s.createdAt)
		lines.push(`**${date}** — ${s.request || "Session"}`)

		if (s.completed) lines.push(`  Completed: ${truncate(s.completed, 120)}`)
		if (s.learned) lines.push(`  Learned: ${truncate(s.learned, 120)}`)
		if (s.nextSteps) lines.push(`  Next: ${truncate(s.nextSteps, 120)}`)

		const allFiles = [...(s.filesRead || []), ...(s.filesModified || [])]
		if (allFiles.length > 0) {
			lines.push(`  Files: ${allFiles.map(basename).slice(0, 5).join(", ")}`)
		}

		lines.push("")
	}

	return lines.join("\n")
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

function groupByDate(observations: ObservationIndex[]): [string, ObservationIndex[]][] {
	const groups = new Map<string, ObservationIndex[]>()

	for (const obs of observations) {
		const dateKey = formatDate(obs.createdAt)
		const existing = groups.get(dateKey)
		if (existing) {
			existing.push(obs)
		} else {
			groups.set(dateKey, [obs])
		}
	}

	return Array.from(groups.entries())
}

function formatDate(epochMs: number): string {
	const d = new Date(epochMs)
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

function formatTime(epochMs: number): string {
	const d = new Date(epochMs)
	const hours = d.getHours().toString().padStart(2, "0")
	const mins = d.getMinutes().toString().padStart(2, "0")
	return `${hours}:${mins}`
}

function basename(filePath: string): string {
	const parts = filePath.split("/")
	return parts[parts.length - 1] || filePath
}

function truncate(text: string, maxLen: number): string {
	if (!text) return ""
	if (text.length <= maxLen) return text
	return text.slice(0, maxLen) + "..."
}
