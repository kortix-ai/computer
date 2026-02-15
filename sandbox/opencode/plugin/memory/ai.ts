/**
 * AI Compression Module for Memory Plugin
 *
 * Provides AI-powered observation compression and session summary generation.
 * Calls the LLM directly via the Kortix router (OpenAI-compatible API)
 * using KORTIX_API_URL and KORTIX_TOKEN env vars.
 *
 * Pattern:
 *   - Per-observation: fire-and-forget async compression (non-blocking)
 *   - Per-session: awaited summary generation on idle timer
 *   - Uses Claude 3 Haiku for cost efficiency
 */

import type { Database } from "bun:sqlite"
import type { Observation, ObservationType } from "./db"
import { getObservationById, updateObservation } from "./db"

// =============================================================================
// TYPES
// =============================================================================

type LogFn = (level: "debug" | "info" | "warn" | "error", message: string) => void

interface CompressedObservation {
	type: ObservationType
	title: string
	subtitle?: string | null
	narrative?: string | null
	facts?: string[]
	concepts?: string[]
	files_read?: string[]
	files_modified?: string[]
}

export interface SessionSummaryFields {
	request: string | null
	investigated: string | null
	learned: string | null
	completed: string | null
	nextSteps: string | null
	filesRead: string[]
	filesModified: string[]
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const LLM_MODEL = "claude-sonnet-4-5-20250929"
const LLM_MAX_TOKENS = 2000
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

const COMPRESSION_SYSTEM = `You are a memory compression agent. Given a tool execution record, produce a structured JSON observation.

Input: tool name, tool arguments, tool output (may be truncated).
Output: ONLY valid JSON with these fields:
{
  "type": "discovery|decision|bugfix|feature|refactor|change",
  "title": "Short descriptive title (max 80 chars)",
  "subtitle": "Optional context line",
  "narrative": "1-3 sentence summary of what happened and why it matters",
  "facts": ["Key fact 1", "Key fact 2"],
  "concepts": ["tag1", "tag2"],
  "files_read": ["/absolute/paths"],
  "files_modified": ["/absolute/paths"]
}

Rules:
- type: discovery=reading/exploring, decision=choosing approach, bugfix=fixing error, feature=adding new, refactor=restructuring, change=modifying existing
- title should be specific and actionable, not generic like "Used tool"
- narrative explains the WHY, not just the WHAT
- facts are discrete, searchable pieces of information
- concepts are semantic tags for cross-session retrieval
- Only include file paths that actually appear in the data
- Output ONLY the JSON object, no markdown fences, no explanation`

const SUMMARY_SYSTEM = `You are a session summarizer. Given a list of observations from an agent session, produce a structured JSON summary.

Output: ONLY valid JSON with these fields:
{
  "request": "What the user originally asked for",
  "investigated": "What was explored/researched",
  "learned": "Key findings and insights",
  "completed": "What was accomplished",
  "next_steps": "Suggested follow-up actions",
  "files_read": ["/paths"],
  "files_modified": ["/paths"]
}

Rules:
- Each field should be 1-3 sentences, rich and specific
- Focus on the WHY and WHAT MATTERS, not just listing actions
- "learned" should capture insights that would help a future session
- "next_steps" should be actionable and specific
- Aggregate file paths from all observations (deduplicated)
- Output ONLY the JSON object, no markdown fences, no explanation`

const ENRICHMENT_SYSTEM = `You are a session summarizer performing an INCREMENTAL UPDATE. You are given:
1. An EXISTING summary from earlier in this session
2. NEW observations that occurred after the existing summary was generated

Merge them into a single updated summary. Preserve all context from the existing summary and integrate new information.

Output: ONLY valid JSON with these fields:
{
  "request": "What the user originally asked for (preserve from existing if unchanged)",
  "investigated": "What was explored/researched (merge existing + new)",
  "learned": "Key findings and insights (merge existing + new)",
  "completed": "What was accomplished (merge existing + new)",
  "next_steps": "Suggested follow-up actions (update based on latest state)",
  "files_read": ["/paths"],
  "files_modified": ["/paths"]
}

Rules:
- Preserve important context from the existing summary — do NOT discard prior work
- Integrate new observations naturally, not just appended
- Each field should be 1-3 sentences, rich and specific
- "next_steps" should reflect the CURRENT state after all observations
- Aggregate file paths from both existing summary and new observations (deduplicated)
- Output ONLY the JSON object, no markdown fences, no explanation`

// =============================================================================
// LLM DIRECT CALL (Kortix Router — OpenAI-compatible)
// =============================================================================

/**
 * Call the Anthropic Messages API directly.
 * Uses ANTHROPIC_API_KEY env var.
 * Returns the assistant's text response, or null on failure.
 */
async function callLLM(system: string, userMessage: string, log: LogFn): Promise<string | null> {
	const apiKey = process.env.ANTHROPIC_API_KEY

	if (!apiKey) {
		log("warn", `[mem:ai] LLM unavailable: ANTHROPIC_API_KEY not set`)
		return null
	}

	try {
		const response = await fetch(ANTHROPIC_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": ANTHROPIC_VERSION,
			},
			body: JSON.stringify({
				model: LLM_MODEL,
				max_tokens: LLM_MAX_TOKENS,
				system,
				messages: [
					{ role: "user", content: userMessage },
				],
			}),
		})

		if (!response.ok) {
			const errorText = await response.text().catch(() => "")
			log("warn", `[mem:ai] Anthropic API error ${response.status}: ${errorText.slice(0, 200)}`)
			return null
		}

		const data = await response.json() as any
		// Anthropic response: { content: [{ type: "text", text: "..." }] }
		const text = data?.content?.[0]?.text
		if (!text) {
			log("warn", `[mem:ai] No text in Anthropic response: ${JSON.stringify(data).slice(0, 200)}`)
			return null
		}

		return text.trim()
	} catch (err) {
		log("warn", `[mem:ai] LLM call failed: ${err}`)
		return null
	}
}

// =============================================================================
// OBSERVATION COMPRESSION
// =============================================================================

/**
 * AI-compress a single observation (fire-and-forget).
 *
 * Called asynchronously after the basic deterministic observation is saved.
 * On success, updates the observation in SQLite with AI-enriched fields.
 * On failure, the basic observation remains unchanged.
 */
export async function compressObservationAsync(
	db: Database,
	obsId: number,
	raw: {
		tool: string
		args: Record<string, unknown>
		output: string
		title?: string
	},
	log: LogFn,
): Promise<void> {
	// Build the user message with raw tool data
	const truncatedOutput = (raw.output || "").slice(0, 2000)
	const userMessage = [
		`Tool: ${raw.tool}`,
		`Arguments: ${JSON.stringify(raw.args).slice(0, 1000)}`,
		`Output (truncated): ${truncatedOutput}`,
		raw.title ? `OpenCode title: ${raw.title}` : "",
	]
		.filter(Boolean)
		.join("\n")

	try {
		const text = await callLLM(COMPRESSION_SYSTEM, userMessage, log)
		if (!text) return

		// Parse JSON
		const compressed = parseCompressedObservation(text)
		if (!compressed) {
			log("warn", `[mem:ai] Failed to parse compression JSON for #${obsId}: ${text.slice(0, 100)}`)
			return
		}

		// Preserve deterministic file paths from extractor.ts when AI returns empty arrays.
		// The AI often returns [] for files_read/files_modified while the deterministic
		// extraction has the correct paths from tool arguments.
		const original = getObservationById(db, obsId)
		const aiFilesRead = compressed.files_read ?? []
		const aiFilesModified = compressed.files_modified ?? []
		const mergedFilesRead = aiFilesRead.length > 0 ? aiFilesRead : (original?.filesRead ?? [])
		const mergedFilesModified = aiFilesModified.length > 0 ? aiFilesModified : (original?.filesModified ?? [])

		// Update the observation in SQLite
		updateObservation(db, obsId, {
			type: compressed.type,
			title: compressed.title,
			subtitle: compressed.subtitle ?? null,
			narrative: compressed.narrative ?? null,
			facts: compressed.facts ?? [],
			concepts: compressed.concepts ?? [],
			filesRead: mergedFilesRead,
			filesModified: mergedFilesModified,
		})

		log("info", `[mem:ai] Enriched #${obsId}: "${compressed.title}"`)
	} catch (err) {
		log("warn", `[mem:ai] Compression failed for #${obsId}: ${err}`)
	}
}

// =============================================================================
// SESSION SUMMARY
// =============================================================================

/**
 * Generate an AI-powered session summary from accumulated observations.
 *
 * Supports two modes:
 *   - **Fresh**: `existingSummary` is null → generates from all observations
 *   - **Incremental**: `existingSummary` provided → merges existing summary with new observations
 *
 * Called when the 30-minute idle timer fires.
 */
export async function generateSessionSummaryAsync(
	db: Database,
	observations: Observation[],
	log: LogFn,
	existingSummary?: SessionSummaryFields | null,
): Promise<SessionSummaryFields> {
	// Fallback if no observations
	if (observations.length === 0) {
		// In incremental mode with no new observations, return the existing summary as-is
		if (existingSummary) return existingSummary
		return {
			request: null,
			investigated: null,
			learned: null,
			completed: null,
			nextSteps: null,
			filesRead: [],
			filesModified: [],
		}
	}

	// Build a compact observation list for the prompt
	const obsList = observations.map((o) => {
		const parts = [
			`[${o.type}] ${o.title}`,
			o.narrative ? `  ${o.narrative}` : "",
			o.facts.length > 0 ? `  Facts: ${o.facts.join("; ")}` : "",
			o.filesRead.length > 0 ? `  Read: ${o.filesRead.join(", ")}` : "",
			o.filesModified.length > 0 ? `  Modified: ${o.filesModified.join(", ")}` : "",
		]
		return parts.filter(Boolean).join("\n")
	}).join("\n\n")

	// Choose system prompt and build user message based on mode
	const isIncremental = existingSummary != null
	const systemPrompt = isIncremental ? ENRICHMENT_SYSTEM : SUMMARY_SYSTEM

	let userMessage: string
	if (isIncremental) {
		const existingJson = JSON.stringify({
			request: existingSummary.request,
			investigated: existingSummary.investigated,
			learned: existingSummary.learned,
			completed: existingSummary.completed,
			next_steps: existingSummary.nextSteps,
			files_read: existingSummary.filesRead,
			files_modified: existingSummary.filesModified,
		}, null, 2)
		userMessage = [
			`EXISTING SUMMARY:\n${existingJson}`,
			`\nNEW OBSERVATIONS (${observations.length}):\n\n${obsList.slice(0, 6000)}`,
		].join("\n")
	} else {
		userMessage = `Session with ${observations.length} observations:\n\n${obsList.slice(0, 8000)}`
	}

	try {
		const text = await callLLM(systemPrompt, userMessage, log)
		if (!text) {
			return fallbackSummary(observations, existingSummary)
		}

		const parsed = parseSummaryJson(text)
		if (!parsed) {
			log("warn", `[mem:ai] Failed to parse summary JSON`)
			return fallbackSummary(observations, existingSummary)
		}

		log("info", `[mem:ai] Summary generated (${isIncremental ? "incremental" : "fresh"})`)
		return parsed
	} catch (err) {
		log("warn", `[mem:ai] Summary generation failed: ${err}`)
		return fallbackSummary(observations, existingSummary)
	}
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Parse AI response into a compressed observation.
 * Handles JSON potentially wrapped in markdown fences.
 */
function parseCompressedObservation(text: string): CompressedObservation | null {
	try {
		const json = extractJson(text)
		const parsed = JSON.parse(json)

		// Validate required fields
		if (!parsed.type || !parsed.title) return null

		// Validate type
		const validTypes = new Set(["discovery", "decision", "bugfix", "feature", "refactor", "change"])
		if (!validTypes.has(parsed.type)) parsed.type = "discovery"

		return {
			type: parsed.type as ObservationType,
			title: String(parsed.title).slice(0, 200),
			subtitle: parsed.subtitle ? String(parsed.subtitle) : null,
			narrative: parsed.narrative ? String(parsed.narrative) : null,
			facts: Array.isArray(parsed.facts) ? parsed.facts.map(String) : [],
			concepts: Array.isArray(parsed.concepts) ? parsed.concepts.map(String) : [],
			files_read: Array.isArray(parsed.files_read) ? parsed.files_read.map(String) : [],
			files_modified: Array.isArray(parsed.files_modified) ? parsed.files_modified.map(String) : [],
		}
	} catch {
		return null
	}
}

/**
 * Parse AI response into session summary fields.
 */
function parseSummaryJson(text: string): SessionSummaryFields | null {
	try {
		const json = extractJson(text)
		const parsed = JSON.parse(json)

		return {
			request: parsed.request ? String(parsed.request) : null,
			investigated: parsed.investigated ? String(parsed.investigated) : null,
			learned: parsed.learned ? String(parsed.learned) : null,
			completed: parsed.completed ? String(parsed.completed) : null,
			nextSteps: parsed.next_steps ? String(parsed.next_steps) : null,
			filesRead: Array.isArray(parsed.files_read) ? parsed.files_read.map(String) : [],
			filesModified: Array.isArray(parsed.files_modified) ? parsed.files_modified.map(String) : [],
		}
	} catch {
		return null
	}
}

/**
 * Extract JSON from text that might be wrapped in markdown fences.
 */
function extractJson(text: string): string {
	// Try to find JSON in markdown code fences
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
	if (fenceMatch?.[1]) return fenceMatch[1].trim()

	// Try to find a JSON object directly
	const objMatch = text.match(/\{[\s\S]*\}/)
	if (objMatch) return objMatch[0]

	return text
}

/**
 * Fallback summary when AI fails — deterministic from observations.
 * In incremental mode, merges with existing summary data.
 */
function fallbackSummary(
	observations: Observation[],
	existingSummary?: SessionSummaryFields | null,
): SessionSummaryFields {
	const allFilesRead = new Set<string>()
	const allFilesModified = new Set<string>()

	// Seed with existing summary file paths if incremental
	if (existingSummary) {
		for (const f of existingSummary.filesRead) allFilesRead.add(f)
		for (const f of existingSummary.filesModified) allFilesModified.add(f)
	}

	for (const obs of observations) {
		for (const f of obs.filesRead) allFilesRead.add(f)
		for (const f of obs.filesModified) allFilesModified.add(f)
	}

	return {
		request: existingSummary?.request ?? null,
		investigated: existingSummary?.investigated
			? `${existingSummary.investigated}; plus ${observations.length} additional tool operations`
			: `Explored ${allFilesRead.size} files across ${observations.length} tool operations`,
		learned: existingSummary?.learned
			? `${existingSummary.learned}; ${observations.length} more observations added`
			: `Generated ${observations.length} observations`,
		completed: existingSummary?.completed
			? `${existingSummary.completed}; modified ${allFilesModified.size} files total`
			: `Modified ${allFilesModified.size} files`,
		nextSteps: existingSummary?.nextSteps ?? null,
		filesRead: Array.from(allFilesRead).slice(0, 20),
		filesModified: Array.from(allFilesModified).slice(0, 20),
	}
}
