/**
 * Memory Plugin for OpenCode — Persistent Observation Memory
 *
 * A native OpenCode plugin that automatically captures tool executions,
 * extracts structured observations, stores them in SQLite with FTS5,
 * and injects relevant past context into future sessions.
 *
 * Inspired by claude-mem (https://docs.claude-mem.ai), reimplemented
 * for OpenCode's programmatic plugin system (no shell hooks, no worker).
 *
 * Building Blocks:
 *   1. tool.execute.after  → Captures tool executions (claude-mem's PostToolUse)
 *   2. event(session.*)    → Session lifecycle (SessionStart + Stop + SessionEnd)
 *   3. experimental.chat.system.transform → Context injection (SessionStart context)
 *   4. experimental.session.compacting    → Context survival across compaction
 *   5. Custom tools        → mem_search, mem_timeline, mem_get, mem_save
 *
 * Database: /workspace/.kortix/mem.db (SQLite + FTS5)
 */

import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

import {
	initMemDb,
	createSession,
	incrementPromptCount,
	completeSession,
	getSession,
	insertObservation,
	getObservationsByIds,
	getObservationsBySessionId,
	getObservationsBySessionIdSince,
	getSummaryBySessionId,
	upsertSummary,
} from "./memory/db"
import type { Database } from "bun:sqlite"
import { extractObservation, SKIP_TOOLS } from "./memory/extractor"
import type { RawToolData } from "./memory/extractor"
import {
	searchObservations,
	getTimelineAround,
	formatSearchResults,
	formatTimeline,
	formatObservations,
} from "./memory/search"
import { generateContextBlock } from "./memory/context"
import { compressObservationAsync, generateSessionSummaryAsync } from "./memory/ai"
import type { SessionSummaryFields } from "./memory/ai"
import { ensureMemDir, writeObservationFile, writeSummaryFile } from "./memory/lss"
import { getObservationById } from "./memory/db"

// =============================================================================
// PLUGIN ENTRY POINT
// =============================================================================

export const MemoryPlugin: Plugin = async ({ directory, client }) => {
	// ── Logging helper ─────────────────────────────────────────────────
	// Logs to BOTH: OpenCode internal API (client.app.log) AND stdout (console.log)
	// so logs appear in `docker logs` as well as OpenCode's log system.
	const log = (level: "debug" | "info" | "warn" | "error", message: string) => {
		const prefix = `[mem:${level}]`
		console.log(`${prefix} ${message}`)
		try {
			client.app.log({
				body: { service: "mem", level, message },
			})
		} catch {
			// Ignore if client.app.log fails (e.g., during init)
		}
	}

	// Initialize SQLite database
	let db: Database
	try {
		db = initMemDb()
	} catch (err) {
		log("error", `[mem] FAILED to initialize database: ${err}`)
		return {}
	}

	// Initialize LSS companion file directory for semantic search indexing
	try {
		ensureMemDir()
	} catch (err) {
		log("warn", `[mem] LSS mem directory creation failed: ${err}`)
	}

	log("info", "[mem] Init: ready")

	// ── Session State ──────────────────────────────────────────────────
	// In-memory state for the current session (persists across tool calls
	// within the same OpenCode process lifetime)

	let currentSessionId: string | null = null
	let currentProjectId: string | null = null
	let promptCount = 0
	let observationCount = 0

	// Cached context block — generated once on session start, injected into system prompt
	let cachedContextBlock: string = ""
	let contextInjectedForSession = false

	// Track all files touched in this session for summary generation
	const sessionFilesRead = new Set<string>()
	const sessionFilesModified = new Set<string>()

	// Capture tool arguments from tool.execute.before (keyed by callID)
	// tool.execute.after only has output/metadata, NOT the original args.
	const pendingToolArgs = new Map<string, Record<string, unknown>>()

	// ── Summary Interval State ───────────────────────────────────────
	// Hourly periodic job: summarizes all observations since last summarized_at.
	// Runs continuously while a session is active. Does not depend on idle events.
	const SUMMARY_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
	let summaryInterval: ReturnType<typeof setInterval> | null = null

	function clearSummaryInterval(): void {
		if (summaryInterval !== null) {
			clearInterval(summaryInterval)
			summaryInterval = null
		}
	}

	/**
	 * Core summary orchestration — handles both fresh and incremental modes.
	 * 1. Checks for existing summary (incremental enrichment)
	 * 2. Fetches only new observations if a prior summary exists
	 * 3. Calls AI with existing summary context (or fresh if none)
	 * 4. Upserts to DB and writes journal entry
	 */
	async function generateSummaryForSession(sessionId: string, markComplete: boolean): Promise<void> {
		try {
			const projectId = await resolveProjectId()

			// Check for existing summary (incremental enrichment)
			const existingSummary = getSummaryBySessionId(db, sessionId)
			let observations: ReturnType<typeof getObservationsBySessionId>
			let existingFields: SessionSummaryFields | null = null

			if (existingSummary?.summarizedAt) {
				// Incremental: only fetch observations created after the last summary
				observations = getObservationsBySessionIdSince(db, sessionId, existingSummary.summarizedAt)
				if (observations.length === 0) {
					if (markComplete) completeSession(db, sessionId)
					return
				}
				existingFields = {
					request: existingSummary.request,
					investigated: existingSummary.investigated,
					learned: existingSummary.learned,
					completed: existingSummary.completed,
					nextSteps: existingSummary.nextSteps,
					filesRead: existingSummary.filesRead,
					filesModified: existingSummary.filesModified,
				}
			} else {
				// Fresh: get all observations
				observations = getObservationsBySessionId(db, sessionId)
				if (observations.length === 0) {
					if (markComplete) completeSession(db, sessionId)
					return
				}
			}

			// AI summary generation (incremental or fresh)
			const summaryFields = await generateSessionSummaryAsync(
				db, observations, log, existingFields,
			)

			const summary = {
				sessionId,
				projectId,
				...summaryFields,
			}

			upsertSummary(db, summary)
			writeJournalEntry(summary)

			// Write companion .md file for LSS semantic search indexing
			try {
				const savedSummary = getSummaryBySessionId(db, sessionId)
				if (savedSummary) writeSummaryFile(sessionId, savedSummary)
			} catch {
				// Non-critical: LSS indexing is best-effort
			}

			log("info", `[mem] Summary: "${(summaryFields.completed || "").slice(0, 80)}"`)

			if (markComplete) {
				completeSession(db, sessionId)
			}
		} catch (err) {
			log("warn", `[mem] Summary generation error: ${err}`)
		}
	}

	/**
	 * Start the hourly summary interval for a session.
	 * Clears any existing interval before starting a new one.
	 * Periodic runs use markComplete=false (don't end the session).
	 */
	function startSummaryInterval(sessionId: string): void {
		clearSummaryInterval()
		summaryInterval = setInterval(() => {
			generateSummaryForSession(sessionId, false).catch((err) => {
				log("warn", `[mem] Summary interval failed: ${err}`)
			})
		}, SUMMARY_INTERVAL_MS)
	}

	// ── Helper: Get project ID ─────────────────────────────────────────

	async function resolveProjectId(): Promise<string | null> {
		if (currentProjectId) return currentProjectId
		try {
			const result = await client.project.current()
			const project = result.data as { id?: string } | undefined
			currentProjectId = project?.id ?? null
		} catch {
			currentProjectId = null
		}
		return currentProjectId
	}

	// ── Helper: Write journal entry ────────────────────────────────────
	// Backward compatibility — also write session summaries to
	// .kortix/journal/ so the existing memory system can find them.

	function writeJournalEntry(summary: {
		request?: string | null
		completed?: string | null
		learned?: string | null
		nextSteps?: string | null
	}): void {
		try {
			const { mkdirSync, writeFileSync } = require("node:fs")
			const { join } = require("node:path")
			const { homedir } = require("node:os")

			const journalDir = join(homedir(), ".kortix", "journal")
			mkdirSync(journalDir, { recursive: true })

			const now = new Date()
			const dateStr = now.toISOString().slice(0, 10)
			const timeStr = now.toTimeString().slice(0, 5)
			const filename = `${dateStr}_${now.getTime()}.md`

			const content = [
				`# Session Summary — ${dateStr} ${timeStr}`,
				"",
				summary.request ? `## Request\n${summary.request}` : "",
				summary.completed ? `## Completed\n${summary.completed}` : "",
				summary.learned ? `## Learned\n${summary.learned}` : "",
				summary.nextSteps ? `## Next Steps\n${summary.nextSteps}` : "",
				"",
				`*Auto-generated by memory plugin*`,
			]
				.filter(Boolean)
				.join("\n\n")

			writeFileSync(join(journalDir, filename), content, "utf-8")
		} catch {
			// Non-critical: silently skip journal writing
		}
	}

	// ═══════════════════════════════════════════════════════════════════
	// RETURN PLUGIN HOOKS + TOOLS
	// ═══════════════════════════════════════════════════════════════════

	return {
		// ── TOOLS (Block 5: Search) ────────────────────────────────────

		tool: {
			/**
			 * Layer 1: Search observation index.
			 * Returns compact results (~50-100 tokens each).
			 * Always start here before using mem_timeline or mem_get.
			 */
			mem_search: tool({
				description:
					"Search observation memory using semantic search (LSS) with keyword fallback (FTS5). " +
					"Returns a compact index of matching observations " +
					"with IDs, titles, types, and dates (~50-100 tokens per result).\n\n" +
					"WORKFLOW: Always search first, then use mem_timeline(anchor=ID) for context, " +
					"then mem_get(ids=[...]) for full details. Never skip to mem_get directly.\n\n" +
					"Supports natural language queries and FTS5 syntax: AND, OR, NOT, \"exact phrases\".",
				args: {
					query: tool.schema.string().describe("Search query (natural language or FTS5 syntax)"),
					limit: tool.schema
						.number()
						.optional()
						.describe("Max results (default 20, max 100)"),
					type: tool.schema
						.string()
						.optional()
						.describe(
							"Filter by type: discovery, decision, bugfix, feature, refactor, change",
						),
					project_id: tool.schema
						.string()
						.optional()
						.describe("Filter by project ID"),
					date_start: tool.schema
						.string()
						.optional()
						.describe("Start date (YYYY-MM-DD)"),
					date_end: tool.schema
						.string()
						.optional()
						.describe("End date (YYYY-MM-DD)"),
				},
				async execute(args, context) {
					const results = searchObservations(db, {
						query: args.query,
						limit: args.limit,
						type: args.type as any,
						projectId: args.project_id,
						dateStart: args.date_start,
						dateEnd: args.date_end,
					})
					context.metadata({ title: `Search: "${args.query}" (${results.totalEstimate} results)` })
					return formatSearchResults(results)
				},
			}),

			/**
			 * Layer 2: Get chronological context around an observation.
			 * Returns medium-detail entries (~100-200 tokens each).
			 */
			mem_timeline: tool({
				description:
					"Get chronological context around a specific observation. " +
					"Shows observations before and after the anchor point " +
					"(~100-200 tokens per entry). Use after mem_search to understand " +
					"the sequence of events around an interesting observation.",
				args: {
					anchor: tool.schema
						.number()
						.describe("Observation ID to center the timeline on"),
					depth_before: tool.schema
						.number()
						.optional()
						.describe("Observations before anchor (default 5, max 20)"),
					depth_after: tool.schema
						.number()
						.optional()
						.describe("Observations after anchor (default 5, max 20)"),
				},
				async execute(args, context) {
					const result = getTimelineAround(
						db,
						args.anchor,
						args.depth_before,
						args.depth_after,
					)
					context.metadata({ title: `Timeline around #${args.anchor}` })
					return formatTimeline(result)
				},
			}),

			/**
			 * Layer 3: Fetch full observation details by IDs.
			 * Returns complete data (~500-1000 tokens each).
			 * Only use after filtering with search/timeline.
			 */
			mem_get: tool({
				description:
					"Fetch full details for specific observation IDs " +
					"(~500-1000 tokens each). ONLY use after filtering with " +
					"mem_search or mem_timeline — never fetch blindly.",
				args: {
					ids: tool.schema
						.array(tool.schema.number())
						.describe("Array of observation IDs to fetch"),
				},
				async execute(args, context) {
					const observations = getObservationsByIds(db, args.ids)
					context.metadata({
						title: `Fetched ${observations.length} observations`,
					})
					return formatObservations(observations)
				},
			}),

			/**
			 * Manually save an observation for future retrieval.
			 * Use when you discover something important that should be remembered.
			 */
			mem_save: tool({
				description:
					"Manually save an observation to memory for future retrieval. " +
					"Use when you discover something important — architecture decisions, " +
					"gotchas, patterns, or key findings worth remembering across sessions.",
				args: {
					text: tool.schema
						.string()
						.describe("Content to remember (will be searchable)"),
					title: tool.schema
						.string()
						.optional()
						.describe("Short title (auto-generated if omitted)"),
					type: tool.schema
						.string()
						.optional()
						.describe(
							"Observation type: discovery (default), decision, bugfix, feature, refactor, change",
						),
				},
				async execute(args, context) {
					const title =
						args.title || args.text.slice(0, 80).replace(/\n/g, " ").trim()
					const type = (args.type || "discovery") as any
					const projectId = await resolveProjectId()

					const id = insertObservation(db, {
						sessionId: currentSessionId || "manual",
						projectId,
						type,
						title,
						subtitle: null,
						narrative: args.text,
						facts: [],
						concepts: ["manual-memory"],
						filesRead: [],
						filesModified: [],
						toolName: "mem_save",
						toolInputPreview: null,
						promptNumber: null,
					})

					context.metadata({ title: `Saved: ${title}` })
					return `Observation #${id} saved: "${title}"`
				},
			}),
		},

		// ── HOOK: tool.execute.before (Capture tool arguments) ────────
		// tool.execute.after only receives output/metadata, NOT the original
		// tool args. We capture args here keyed by callID and look them up later.

		"tool.execute.before": async (input, output) => {
			try {
				if (!SKIP_TOOLS.has(input.tool)) {
					pendingToolArgs.set(input.callID, (output.args ?? {}) as Record<string, unknown>)
				}
			} catch {
				// Non-critical — worst case we fall back to empty args
			}
		},

		// ── HOOK: tool.execute.after (Block 1a: PostToolUse) ───────────

		"tool.execute.after": async (input, output) => {
			try {
				if (SKIP_TOOLS.has(input.tool)) return

				// Look up captured args from tool.execute.before
				const capturedArgs = pendingToolArgs.get(input.callID) ?? {}
				pendingToolArgs.delete(input.callID)

				// Ensure session exists
				if (!currentSessionId) {
					currentSessionId = input.sessionID
					const projectId = await resolveProjectId()
					createSession(db, currentSessionId, projectId)
				}

				// Build raw tool data with REAL args from tool.execute.before
				const raw: RawToolData = {
					tool: input.tool,
					args: capturedArgs,
					output: output.output || "",
					title: output.title,
				}

				// Extract structured observation (deterministic, immediate)
				const observation = extractObservation(
					raw,
					currentSessionId,
					currentProjectId,
					promptCount,
				)

				if (observation) {
					const obsId = insertObservation(db, observation)
					observationCount++

					// Write companion .md file for LSS semantic search indexing
					try {
						const savedObs = getObservationById(db, obsId)
						if (savedObs) writeObservationFile(savedObs)
					} catch {
						// Non-critical: LSS indexing is best-effort
					}

					// Track files for session summary
					for (const f of observation.filesRead) sessionFilesRead.add(f)
					for (const f of observation.filesModified) sessionFilesModified.add(f)

					log("info", `[mem] PostToolUse: #${obsId} [${observation.type}] "${observation.title}"`)

					// Fire-and-forget: AI enrichment (non-blocking)
					// After enrichment succeeds, re-write the companion file with AI-enhanced data
					compressObservationAsync(db, obsId, raw, log).then(() => {
						try {
							const enrichedObs = getObservationById(db, obsId)
							if (enrichedObs) writeObservationFile(enrichedObs)
						} catch {
							// Non-critical
						}
					}).catch((err) => {
						log("warn", `[mem:ai] Compression failed for #${obsId}: ${err}`)
					})
				}
			} catch (err) {
				log("warn", `[mem] ⚠ tool.execute.after FAILED for ${input.tool}: ${err}`)
			}
		},

		// ── HOOK: chat.message (Session init + prompt counting) ─────────

		"chat.message": async (input) => {
			try {
				// Initialize session if not yet set (e.g., first message)
				if (!currentSessionId && input.sessionID) {
					currentSessionId = input.sessionID
					const projectId = await resolveProjectId()
					createSession(db, currentSessionId, projectId)
				}

				// Increment prompt count
				if (currentSessionId) {
					promptCount = incrementPromptCount(db, currentSessionId)
					log("info", `[mem] UserPrompt: #${promptCount}`)
				}
			} catch (err) {
				log("warn", `[mem] ⚠ chat.message error: ${err}`)
			}
		},

		// ── HOOK: event (Block 1b: Session Lifecycle) ──────────────────

		event: async ({ event }: { event: Event }) => {
			try {
				// Session created — initialize tracking
				if (event.type === "session.created") {
					const info = (event as any).properties?.info
					const sessionID = info?.id as string | undefined
					if (!sessionID) return

					// If an interval is running for the old session, stop it and fire final summary
					if (summaryInterval !== null && currentSessionId) {
						const oldSessionId = currentSessionId
						clearSummaryInterval()
						// Fire-and-forget: generate summary for old session without blocking new session init
						generateSummaryForSession(oldSessionId, true).catch((err) => {
							log("warn", `[mem] ⚠ Old session summary failed: ${err}`)
						})
					}

					currentSessionId = sessionID
					promptCount = 0
					observationCount = 0
					sessionFilesRead.clear()
					sessionFilesModified.clear()

					const projectId = info?.projectID ?? (await resolveProjectId())
					if (projectId) currentProjectId = projectId
					createSession(db, sessionID, currentProjectId)
					cachedContextBlock = generateContextBlock(db, currentProjectId ?? undefined)
					contextInjectedForSession = false

					log("info", `[mem] SessionStart: ${sessionID.slice(0, 12)}...`)
					// Start hourly summary interval for this session
					startSummaryInterval(sessionID)
				}

				// Note: prompt counting moved to chat.message hook (fires once per user message).
				// session.updated and session.status fire many times per prompt and are not reliable.

				// Session deleted — cancel interval, fire final summary, reset state
				if (event.type === "session.deleted") {
					const sessionID = (event as any).properties?.sessionID ?? (event as any).properties?.info?.id
					if (sessionID === currentSessionId) {
						clearSummaryInterval()
						// Fire final summary before cleanup
						generateSummaryForSession(sessionID, true).catch(() => {})
						currentSessionId = null
						promptCount = 0
						observationCount = 0
						sessionFilesRead.clear()
						sessionFilesModified.clear()
						cachedContextBlock = ""
						contextInjectedForSession = false
						log("info", `[mem] SessionEnd: ${sessionID?.slice(0, 12)}...`)
					}
				}
			} catch (err) {
				log("warn", `[mem] ⚠ Event handler error (${event.type}): ${err}`)
			}
		},

		// ── HOOK: Context Injection (Block 4) ──────────────────────────
		// Inject past observations into system context on every LLM call.
		// output.system is string[] — we push a new entry (non-destructive).

		"experimental.chat.system.transform": async (_input, output) => {
			try {
				if (!cachedContextBlock) {
					cachedContextBlock = generateContextBlock(db, currentProjectId ?? undefined)
				}
				if (cachedContextBlock) {
					output.system.push(cachedContextBlock)
					if (!contextInjectedForSession) {
						log("info", `[mem] ContextInjection: ~${cachedContextBlock.length} chars`)
						contextInjectedForSession = true
					}
				}
			} catch (err) {
				log("warn", `[mem] Context injection error: ${err}`)
			}
		},

		// ── HOOK: Compaction Survival (Block 4b) ───────────────────────
		// Re-inject observation context so it survives context compaction.

		"experimental.session.compacting": async (input, output) => {
			try {
				const context = generateContextBlock(db, currentProjectId ?? undefined, 15, 3)
				if (context) {
					output.context.push(context)
				}
			} catch (err) {
				log("warn", `[mem] ⚠ Compaction injection error: ${err}`)
			}
		},
	}
}

export default MemoryPlugin
