/**
 * LLM-Powered Memory Consolidation Engine
 *
 * During compaction, reads the session's observations and uses an LLM
 * to extract durable long-term memories in three categories:
 *   - Episodic: what happened (events, outcomes, tasks)
 *   - Semantic: what is known (facts, architecture, patterns)
 *   - Procedural: how to do things (workflows, recipes, commands)
 *
 * LLM routing:
 *   1. Kortix router (OpenAI-compatible) — KORTIX_API_URL + KORTIX_TOKEN
 *   2. Anthropic Messages API — ANTHROPIC_API_KEY (fallback)
 */

import type { Database } from "bun:sqlite"
import {
	getObservationsBySession,
	getAllLTM,
	insertLTM,
	markConsolidated,
} from "./db"
import type {
	Observation,
	LTMEntry,
	CreateLTMInput,
	ConsolidationResult,
	LogFn,
} from "./types"

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ConsolidateOptions {
	kortixUrl?: string
	kortixToken?: string
	anthropicKey?: string
	anthropicBaseUrl?: string
	model?: string
	maxTokens?: number
}

const KORTIX_MODEL = "kortix/basic"
const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929"
const MAX_TOKENS = 2000
const ANTHROPIC_VERSION = "2023-06-01"

// ─── Prompts ─────────────────────────────────────────────────────────────────

const CONSOLIDATION_SYSTEM = `You are a memory consolidation agent. Given a session's tool observations, extract durable long-term memories.

Categorize into three types:

EPISODIC — What happened: events, tasks completed, failures, decisions made.
  Example: "Built JWT authentication system for the Express API"

SEMANTIC — What is known: facts about the codebase, architecture, patterns, config.
  Example: "The frontend uses SolidJS with Tailwind at apps/frontend/"

PROCEDURAL — How to do things: workflows, commands, debugging steps, recipes.
  Example: "Deploy: run bun build, then docker compose up -d"

Rules:
- Focus on DURABLE knowledge — things useful in future sessions
- Do NOT include trivial file reads or generic tool usage
- Each memory should be a complete, self-contained statement
- Deduplicate against EXISTING_LTM — skip facts that already exist
- Be specific (include paths, commands, names) not vague
- Output ONLY valid JSON, no markdown fences

Output format:
{
  "episodic": [
    { "content": "...", "context": "optional detail", "tags": ["tag1"], "files": ["/path"], "source_observation_ids": [1,2] }
  ],
  "semantic": [ ... ],
  "procedural": [ ... ]
}`

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Consolidate a session's observations into long-term memories.
 * Called during the compaction hook.
 */
export async function consolidateMemories(
	db: Database,
	sessionId: string,
	log: LogFn,
	opts?: ConsolidateOptions,
): Promise<ConsolidationResult> {
	const empty: ConsolidationResult = { newMemories: [] }

	// 1. Get session observations
	const observations = getObservationsBySession(db, sessionId)
	if (observations.length === 0) return empty

	// 2. Resolve LLM provider
	const config = resolveLLMConfig(opts)
	if (!config) {
		log("warn", `[memory:consolidate] No LLM provider available — skipping consolidation`)
		return empty
	}

	// 3. Get existing LTM for dedup context
	const existingLTM = getAllLTM(db)

	// 4. Build prompt
	const userMessage = buildUserMessage(observations, existingLTM)

	// 5. Call LLM
	try {
		const text = await callLLM(config, CONSOLIDATION_SYSTEM, userMessage, log)
		if (!text) return empty

		// 6. Parse response
		const parsed = parseConsolidationResponse(text, log)
		if (!parsed) return empty

		// 7. Store new LTM entries
		const newMemories: CreateLTMInput[] = []

		for (const entry of parsed.episodic) {
			const input = toLTMInput("episodic", entry, sessionId)
			newMemories.push(input)
			insertLTM(db, input)
		}
		for (const entry of parsed.semantic) {
			const input = toLTMInput("semantic", entry, sessionId)
			newMemories.push(input)
			insertLTM(db, input)
		}
		for (const entry of parsed.procedural) {
			const input = toLTMInput("procedural", entry, sessionId)
			newMemories.push(input)
			insertLTM(db, input)
		}

		// 8. Mark session as consolidated
		markConsolidated(db, sessionId)

		log("info", `[memory:consolidate] Created ${newMemories.length} LTM entries`)

		return { newMemories }
	} catch (err) {
		log("warn", `[memory:consolidate] Failed: ${err}`)
		return empty
	}
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

function buildUserMessage(observations: Observation[], existingLTM: LTMEntry[]): string {
	const parts: string[] = []

	// Existing LTM section (for dedup)
	if (existingLTM.length > 0) {
		parts.push("EXISTING_LTM (do NOT duplicate — skip facts that already exist):")
		for (const ltm of existingLTM.slice(0, 50)) {
			parts.push(`  [id=${ltm.id}] [${ltm.type}] ${ltm.content}`)
		}
		parts.push("")
	}

	// Session observations
	parts.push(`SESSION OBSERVATIONS (${observations.length} total):`)
	parts.push("")
	for (const obs of observations.slice(0, 80)) {
		const files = [...obs.filesRead, ...obs.filesModified]
		const filePart = files.length > 0 ? ` | Files: ${files.join(", ")}` : ""
		const factsPart = obs.facts.length > 0 ? ` | Facts: ${obs.facts.join("; ")}` : ""
		parts.push(`  [#${obs.id}] [${obs.type}] ${obs.title} — ${obs.narrative}${filePart}${factsPart}`)
	}

	return parts.join("\n").slice(0, 12000)
}

// ─── LLM Call ────────────────────────────────────────────────────────────────

interface LLMConfig {
	type: "kortix" | "anthropic"
	baseURL: string
	apiKey: string
	model: string
}

function resolveLLMConfig(opts?: ConsolidateOptions): LLMConfig | null {
	// Priority 1: Kortix router
	const kortixUrl = opts?.kortixUrl ?? process.env.KORTIX_API_URL
	const kortixToken = opts?.kortixToken ?? process.env.KORTIX_TOKEN
	if (kortixUrl && kortixToken) {
		return {
			type: "kortix",
			baseURL: kortixUrl.replace(/\/+$/, ""),
			apiKey: kortixToken,
			model: opts?.model ?? KORTIX_MODEL,
		}
	}

	// Priority 2: Anthropic API
	const anthropicKey = opts?.anthropicKey ?? process.env.ANTHROPIC_API_KEY
	if (anthropicKey) {
		const baseURL = (opts?.anthropicBaseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/+$/, "")
		return {
			type: "anthropic",
			baseURL,
			apiKey: anthropicKey,
			model: opts?.model ?? ANTHROPIC_MODEL,
		}
	}

	return null
}

async function callLLM(
	config: LLMConfig,
	system: string,
	userMessage: string,
	log: LogFn,
): Promise<string | null> {
	try {
		if (config.type === "kortix") {
			return await callOpenAICompatible(config, system, userMessage, log)
		} else {
			return await callAnthropicAPI(config, system, userMessage, log)
		}
	} catch (err) {
		log("warn", `[memory:consolidate] LLM call failed: ${err}`)
		return null
	}
}

async function callOpenAICompatible(
	config: LLMConfig,
	system: string,
	userMessage: string,
	log: LogFn,
): Promise<string | null> {
	const url = `${config.baseURL}/chat/completions`
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model: config.model,
			max_tokens: MAX_TOKENS,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: userMessage },
			],
		}),
	})

	if (!response.ok) {
		const text = await response.text().catch(() => "")
		log("warn", `[memory:consolidate] Kortix API error ${response.status}: ${text.slice(0, 200)}`)
		return null
	}

	const data = await response.json() as any
	const text = data?.choices?.[0]?.message?.content
	return text?.trim() ?? null
}

async function callAnthropicAPI(
	config: LLMConfig,
	system: string,
	userMessage: string,
	log: LogFn,
): Promise<string | null> {
	const url = `${config.baseURL}/v1/messages`
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": config.apiKey,
			"anthropic-version": ANTHROPIC_VERSION,
		},
		body: JSON.stringify({
			model: config.model,
			max_tokens: MAX_TOKENS,
			system,
			messages: [{ role: "user", content: userMessage }],
		}),
	})

	if (!response.ok) {
		const text = await response.text().catch(() => "")
		log("warn", `[memory:consolidate] Anthropic API error ${response.status}: ${text.slice(0, 200)}`)
		return null
	}

	const data = await response.json() as any
	const text = data?.content?.[0]?.text
	return text?.trim() ?? null
}

// ─── Response Parser ─────────────────────────────────────────────────────────

interface RawConsolidation {
	episodic: RawMemoryEntry[]
	semantic: RawMemoryEntry[]
	procedural: RawMemoryEntry[]
}

interface RawMemoryEntry {
	content: string
	context?: string
	tags?: string[]
	files?: string[]
	source_observation_ids?: number[]
}

function parseConsolidationResponse(text: string, log: LogFn): RawConsolidation | null {
	try {
		const json = extractJson(text)
		const parsed = JSON.parse(json)

		return {
			episodic: Array.isArray(parsed.episodic) ? parsed.episodic.filter(validEntry) : [],
			semantic: Array.isArray(parsed.semantic) ? parsed.semantic.filter(validEntry) : [],
			procedural: Array.isArray(parsed.procedural) ? parsed.procedural.filter(validEntry) : [],
		}
	} catch (err) {
		log("warn", `[memory:consolidate] Failed to parse JSON: ${err}`)
		return null
	}
}

function validEntry(entry: unknown): entry is RawMemoryEntry {
	if (!entry || typeof entry !== "object") return false
	const e = entry as Record<string, unknown>
	return typeof e.content === "string" && e.content.length > 0
}

function extractJson(text: string): string {
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
	if (fenceMatch?.[1]) return fenceMatch[1].trim()
	const objMatch = text.match(/\{[\s\S]*\}/)
	if (objMatch) return objMatch[0]
	return text
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLTMInput(
	type: CreateLTMInput["type"],
	entry: RawMemoryEntry,
	sessionId: string,
): CreateLTMInput {
	return {
		type,
		content: entry.content,
		context: entry.context ?? null,
		sourceSessionId: sessionId,
		sourceObservationIds: entry.source_observation_ids ?? [],
		tags: entry.tags ?? [],
		files: entry.files ?? [],
	}
}
