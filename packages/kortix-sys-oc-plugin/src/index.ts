/**
 * Kortix Memory Plugin for OpenCode
 *
 * Long-term memory with episodic/semantic/procedural consolidation,
 * hybrid BM25+vector search, and cross-session context retrieval.
 *
 * Hooks:
 *   tool.execute.before        — capture tool args by callID
 *   tool.execute.after         — extract observations from tool results
 *   chat.message               — track session + prompt count
 *   event                      — session lifecycle + consolidation triggers:
 *                                  session.created  — init session, sweep unconsolidated previous sessions
 *                                  session.deleted  — mark session completed
 *                                  session.idle     — incremental consolidation of current session
 *   messages.transform         — inject LTM index as synthetic message at position 1
 *   session.compacting         — consolidate observations → LTM, inject into compaction context
 *
 * Consolidation fires in 4 places (ensuring no session's observations are lost):
 *   1. Plugin startup          — sweep orphaned sessions from previous runs
 *   2. session.created         — sweep previous sessions not yet consolidated
 *   3. session.idle            — incremental consolidation of current session (cooldown-gated)
 *   4. session.compacting      — full consolidation during context window compression
 *
 * Tools:
 *   ltm_search                 — hybrid search across long-term memories
 *   observation_search         — hybrid search across observations
 *   get_mem                    — fetch full record by ID (LTM or observation)
 *   ltm_save                   — manually persist an LTM entry
 *   session_list               — browse past sessions with metadata
 *   session_get                — retrieve a session's conversation (TTC-compressed)
 */

import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Session, Todo } from "@opencode-ai/sdk"
import { initDb, insertObservation, ensureSession, incrementPromptCount, completeSession, insertLTM, getObservationById, getLTMById, getLTMByIds, getObservationsByIds, getUnconsolidatedSessions, getNewObservationCount, updateSessionTitle } from "./db"
import { extractObservation } from "./extract"
import { generateContextBlock } from "./context"
import { consolidateMemories } from "./consolidate"
import { initEnrichment, enqueueEnrichment, updateEnrichmentOpts } from "./enrich"
import { initSearch, hybridSearchLTM, hybridSearchObservations } from "./search"
import { ensureMemDir, writeObservationFile, writeLTMFile } from "./lss"
import { existsSync, writeFileSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { getEnv, shortTs, changeSummary, formatMessages, ttcCompress, STORAGE_BASE, DB_PATH } from "./session"
import type { LogFn, CreateLTMInput, LTMType } from "./types"

// ─── Plugin Entry ────────────────────────────────────────────────────────────

const TOOL_OUTPUTS_DIR = "/workspace/.kortix/tool-outputs"

/** Session pruning only applies to Anthropic models (prompt cache cost optimization) */
function isAnthropicModel(modelId: string | null): boolean {
	if (!modelId) return false
	const lower = modelId.toLowerCase()
	// Direct Anthropic model IDs + Kortix aliases that resolve to Anthropic
	return lower.includes("anthropic") || lower.includes("claude") || lower.startsWith("kortix/")
}

export const KortixMemoryPlugin: Plugin = async ({ client, project, directory }) => {
	// ── State ──────────────────────────────────────────────────────────
	let db: ReturnType<typeof initDb>
	try {
		db = initDb()
	} catch (err) {
		// Log to stderr so it shows in container logs but don't crash OpenCode
		console.error(`[kortix-memory] DB init failed: ${err}`)
		console.error(`[kortix-memory] Plugin running in degraded mode (memory disabled)`)
		// Return a minimal no-op plugin so OpenCode keeps working
		return { tools: {}, hooks: {} }
	}
	// LSS is optional — if the dir can't be created, observations still go to SQLite
	let memDir: string | null = null
	try {
		memDir = ensureMemDir()
	} catch (err) {
		console.error(`[kortix-memory] LSS dir init failed (non-fatal): ${err}`)
	}

	// Project context — used for scoping search results and session tracking
	const projectId: string | null = project?.id ?? null
	const projectDir: string | null = directory ?? null

	let currentSessionId: string | null = null
	let currentModel: string | null = null
	let promptCount = 0
	const pendingArgs = new Map<string, Record<string, unknown>>()

	// Logging via OpenCode SDK
	const log: LogFn = (level, message) => {
		try {
			client.app.log({
				body: { service: "kortix-memory", level, message },
			}).catch(() => {})
		} catch {
			// SDK unavailable — silent
		}
	}

	// Cache the context block — regenerated on session start and after consolidation
	let cachedContextBlock = ""

	function refreshContextCache(): void {
		try {
			cachedContextBlock = generateContextBlock(db, {
				projectId: projectId ?? undefined,
				currentSessionId: currentSessionId ?? undefined,
			})
		} catch (err) {
			log("warn", `[memory] Context cache refresh failed: ${err}`)
		}
	}

	// Ensure USER.md exists for personalization
	const KORTIX_DIR = "/workspace/.kortix"
	const USER_MD_PATH = `${KORTIX_DIR}/USER.md`
	try {
		if (!existsSync(KORTIX_DIR)) mkdirSync(KORTIX_DIR, { recursive: true })
		if (!existsSync(USER_MD_PATH)) {
			writeFileSync(USER_MD_PATH, [
				"# User Profile",
				"",
				"<!-- Auto-created by kortix-sys-oc-plugin. The agent enriches this file as it learns about you. -->",
				"",
				"## Preferences",
				"",
				"## Work Style",
				"",
				"## Context",
				"",
			].join("\n"), "utf-8")
		}
	} catch (err) {
		console.error(`[kortix-memory] USER.md init failed (non-fatal): ${err}`)
	}

	// Generate initial cache
	refreshContextCache()

	// Initialize AI enrichment module
	initEnrichment(db, log)

	// Initialize hybrid search engine
	initSearch(log)

	// ── Background Consolidation ──────────────────────────────────────
	// Consolidate sessions that were never processed (or have new observations).
	// Runs in the background without blocking the main hook flow.
	let consolidationInProgress = false
	let lastConsolidationAttempt = 0
	const CONSOLIDATION_COOLDOWN_MS = 60_000 // Don't attempt consolidation more than once per minute

	/**
	 * Consolidate unconsolidated sessions in the background.
	 * Called on session.created (sweep previous sessions) and session.idle
	 * (incremental consolidation of the current session).
	 *
	 * @param excludeSessionId - Skip this session (e.g., the current active one on startup sweep)
	 * @param specificSessionId - If set, only consolidate this specific session
	 */
	async function backgroundConsolidate(
		excludeSessionId?: string,
		specificSessionId?: string,
	): Promise<void> {
		if (consolidationInProgress) return

		// Cooldown: don't spam consolidation attempts (session.idle fires often)
		const now = Date.now()
		if (now - lastConsolidationAttempt < CONSOLIDATION_COOLDOWN_MS) return
		lastConsolidationAttempt = now

		consolidationInProgress = true

		try {
			let sessionsToConsolidate: { id: string }[] = []

			if (specificSessionId) {
				// Check if this specific session has new observations worth consolidating
				const newObs = getNewObservationCount(db, specificSessionId)
				if (newObs >= 3) {
					sessionsToConsolidate = [{ id: specificSessionId }]
				}
			} else {
				// Sweep: find all sessions with unconsolidated observations
				sessionsToConsolidate = getUnconsolidatedSessions(db, excludeSessionId)
			}

			if (sessionsToConsolidate.length === 0) {
				return
			}

			log("info", `[memory] Background consolidation: ${sessionsToConsolidate.length} session(s) to process`)

			for (const session of sessionsToConsolidate) {
				try {
					const result = await consolidateMemories(db, session.id, log,
						currentModel ? { model: currentModel } : undefined,
					)

					// Write LSS files for new LTM entries
					if (memDir && result.newMemories.length > 0) {
						for (const mem of result.newMemories) {
							try {
								// Re-read latest LTM to get the ID
								// (insertLTM was called inside consolidateMemories)
								writeLTMFile(memDir, 0, mem.type, mem.content, mem.tags ?? [])
							} catch { /* non-fatal */ }
						}
					}

					log("info", `[memory] Consolidated session ${session.id}: ${result.newMemories.length} new memories`)
				} catch (err) {
					log("warn", `[memory] Background consolidation failed for ${session.id}: ${err}`)
				}
			}

			// Refresh cache after all consolidations
			refreshContextCache()
		} finally {
			consolidationInProgress = false
		}
	}

	// ── Startup sweep: consolidate any orphaned sessions from previous runs ──
	// Fire-and-forget — runs async without blocking plugin init
	backgroundConsolidate().catch((err) => {
		log("warn", `[memory] Startup consolidation sweep failed: ${err}`)
	})

	// ── Return hooks ──────────────────────────────────────────────────
	return {

		// ── HOOK: Capture tool args before execution ──────────────────
		// The tool.execute.after hook doesn't include args, so we
		// capture them here keyed by callID.
		"tool.execute.before": async (input, output) => {
			try {
				pendingArgs.set(input.callID, { ...output.args })
			} catch { /* non-fatal */ }
		},

		// ── HOOK: Extract observations from tool results ──────────────
		"tool.execute.after": async (input, output) => {
			try {
				if (!currentSessionId) return

				const args = pendingArgs.get(input.callID) ?? {}
				pendingArgs.delete(input.callID)

				const result = extractObservation(
					{
						tool: input.tool,
						args: args as Record<string, unknown>,
						output: output.output ?? "",
						title: output.title ?? undefined,
					},
					currentSessionId,
					promptCount,
				)

				if (result) {
					const { observation: obs, rawOutput } = result
					const id = insertObservation(db, obs)

					// Write LSS companion file (fire-and-forget)
					if (memDir) try {
						writeObservationFile(memDir, id, {
							title: obs.title,
							narrative: obs.narrative,
							type: obs.type,
							facts: obs.facts,
							concepts: obs.concepts,
							filesRead: obs.filesRead,
							filesModified: obs.filesModified,
						})
					} catch { /* non-fatal */ }

					// Refresh context cache (observations index)
					refreshContextCache()

					// Fire-and-forget AI enrichment
					enqueueEnrichment({
						obsId: id,
						toolName: input.tool,
						args: args as Record<string, unknown>,
						rawOutput,
					})

					// Store full raw output for get_tool_output retrieval (Anthropic only — pruning is Anthropic-specific)
					if (isAnthropicModel(currentModel)) {
						try {
							const fullOutput = output.output ?? ""
							if (fullOutput.length > 200) {
								if (!existsSync(TOOL_OUTPUTS_DIR)) mkdirSync(TOOL_OUTPUTS_DIR, { recursive: true })
								writeFileSync(`${TOOL_OUTPUTS_DIR}/${id}.txt`, fullOutput.slice(0, 512_000), "utf-8")
							}
						} catch { /* non-fatal */ }
					}
				}
			} catch (err) {
				log("warn", `[memory] Observation extraction failed: ${err}`)
			}
		},

		// ── HOOK: Track session + prompt count ────────────────────────
		"chat.message": async (input, _output) => {
			try {
				if (input.sessionID && input.sessionID !== currentSessionId) {
					currentSessionId = input.sessionID
					ensureSession(db, currentSessionId, projectId ?? undefined)
					refreshContextCache()
				}
				if (currentSessionId) {
					promptCount = incrementPromptCount(db, currentSessionId)
				}
				// Capture the user's selected model for LLM consolidation + enrichment
				if (input.model?.modelID) {
					currentModel = input.model.modelID
					updateEnrichmentOpts({ model: currentModel })
					log("info", `[memory] Model updated: ${currentModel}`)
				}
			} catch (err) {
				log("warn", `[memory] chat.message hook failed: ${err}`)
			}
		},

		// ── HOOK: Session lifecycle ───────────────────────────────────
		event: async ({ event }) => {
			try {
				if (event.type === "session.created") {
					const sessionId = (event as any).properties?.info?.id
					if (sessionId) {
						currentSessionId = sessionId
						ensureSession(db, sessionId, projectId ?? undefined)
						promptCount = 0
						refreshContextCache()

						// Cache session title from OpenCode metadata
						const sessionTitle = (event as any).properties?.info?.title
						if (sessionTitle) {
							try { updateSessionTitle(db, sessionId, sessionTitle) } catch { /* non-fatal */ }
						}

						// Cleanup stale tool output files (>24h old)
						try {
							if (existsSync(TOOL_OUTPUTS_DIR)) {
								const cutoff = Date.now() - 24 * 60 * 60 * 1000
								for (const file of readdirSync(TOOL_OUTPUTS_DIR)) {
									const fp = `${TOOL_OUTPUTS_DIR}/${file}`
									const st = statSync(fp)
									if (st.mtimeMs < cutoff) unlinkSync(fp)
								}
							}
						} catch { /* non-fatal */ }

						// Sweep: consolidate any previous sessions that were never processed.
						// Excludes the just-created session (it has no observations yet).
						backgroundConsolidate(sessionId).catch((err) => {
							log("warn", `[memory] Session-created consolidation sweep failed: ${err}`)
						})
					}
				}

				if (event.type === "session.deleted") {
					const sessionId = (event as any).properties?.info?.id
					if (sessionId) {
						completeSession(db, sessionId)
					}
				}

				// Cache session title when OpenCode updates it (title often set after creation)
				if (event.type === "session.updated") {
					const info = (event as any).properties?.info
					if (info?.id && info?.title) {
						try { updateSessionTitle(db, info.id, info.title) } catch { /* non-fatal */ }
					}
				}

				// ── session.idle: Incremental consolidation of current session ──
				// Fires when the agent finishes responding. If the current session has
				// accumulated enough new observations since last consolidation, process them.
				if (event.type === "session.idle") {
					const sessionId = (event as any).properties?.sessionID ?? currentSessionId
					if (sessionId) {
						backgroundConsolidate(undefined, sessionId).catch((err) => {
							log("warn", `[memory] Session-idle consolidation failed: ${err}`)
						})
					}
				}
			} catch (err) {
				log("warn", `[memory] event hook failed: ${err}`)
			}
		},

		// ── HOOK: Inject LTM index as synthetic user message at position 1
		// System prompt untouched → KV cache preserved for prefix.
		// Synthetic message at position 1 is stable across turns (LTM rarely changes).
		"experimental.chat.messages.transform": async (_input, output) => {
			try {
				const parts: string[] = []

				if (currentSessionId) {
					parts.push(`<session_context>\nSession ID: ${currentSessionId}\n</session_context>`)
				}

				if (cachedContextBlock) {
					parts.push(cachedContextBlock)
				}

				// Inject pruning awareness only for Anthropic models (pruning is Anthropic-specific)
				if (isAnthropicModel(currentModel)) {
					parts.push([
						`<context_pruning_awareness>`,
						`Long conversations get server-side context pruning. You'll see these markers in older tool results:`,
						`- Soft-trimmed: "[Tool result trimmed: kept first X and last Y of Z chars.]" — head + tail preserved, middle removed`,
						`- Hard-cleared: "[Old tool result content cleared]" — entire output replaced`,
						`When you need the full output: use observation_search to find the observation, then call get_tool_output(observation_id).`,
						`If a trimmed result has important info, save it via ltm_save before it gets hard-cleared.`,
						`</context_pruning_awareness>`,
					].join("\n"))
				}

				if (parts.length === 0) return

				const MARKER = "<!-- kortix-mem-context -->"
				const syntheticText = `${MARKER}\n${parts.join("\n\n")}`

				const messages = output.messages

				// Check if synthetic message already exists (idempotent on repeated hook calls)
				const existingIdx = messages.findIndex(
					(m: any) => m.parts?.some((p: any) => p.type === "text" && p.text?.includes(MARKER))
				)

				if (existingIdx >= 0) {
					// Update in place
					const msg = messages[existingIdx] as any
					const part = msg.parts.find((p: any) => p.type === "text" && p.text?.includes(MARKER))
					if (part) part.text = syntheticText
				} else {
					// Insert synthetic user message at position 1 (after system prompt)
					const insertIdx = Math.min(1, messages.length)
					messages.splice(insertIdx, 0, {
						info: {
							role: "user",
							id: "__kortix_mem_context__",
							sessionID: currentSessionId ?? "",
							parts: [],
							createdAt: new Date().toISOString(),
						} as any,
						parts: [{
							type: "text",
							text: syntheticText,
						} as any],
					})
				}
			} catch (err) {
				log("warn", `[memory] messages.transform failed: ${err}`)
			}
		},

		// ── HOOK: Compaction — consolidate + inject ───────────────────
		// This is the "sleep cycle": observations → LTM.
		"experimental.session.compacting": async (input, output) => {
			try {
				const sessionId = input.sessionID
				if (!sessionId) return

				// 1. Run LLM consolidation (observations → LTM)
				const result = await consolidateMemories(db, sessionId, log,
					currentModel ? { model: currentModel } : undefined,
				)

				// 2. Write LSS files for new LTM entries
				if (memDir) {
					for (const mem of result.newMemories) {
						try {
							writeLTMFile(memDir, 0, mem.type, mem.content, mem.tags ?? [])
						} catch { /* non-fatal */ }
					}
				}

				// 3. Refresh the LTM cache
				refreshContextCache()

				// 4. Inject LTM block into compaction context
				if (cachedContextBlock) {
					output.context.push(cachedContextBlock)
				}

				log("info", `[memory] Compaction consolidation complete: ${result.newMemories.length} new memories`)
			} catch (err) {
				log("warn", `[memory] Compaction consolidation failed: ${err}`)
			}
		},

		// ── TOOLS ─────────────────────────────────────────────────────
		tool: {

			// Search long-term memories (hybrid BM25 + vector)
			ltm_search: tool({
				description: `Search long-term memories (episodic/semantic/procedural knowledge consolidated from past sessions). Returns a compact list of matching entries with IDs and captions. Use get_mem to retrieve full details of a specific entry.`,
				args: {
					query: tool.schema.string().describe("Search query (keywords or natural language)"),
					tags: tool.schema.string().optional().describe("Comma-separated tags to filter by"),
					type: tool.schema
						.enum(["episodic", "semantic", "procedural"])
						.optional()
						.describe("Filter by memory type"),
					limit: tool.schema.number().optional().describe("Max results (default 10)"),
				},
				async execute(args) {
					const limit = args.limit ?? 10
					const ranked = await hybridSearchLTM(db, args.query, {
						limit,
						type: args.type,
						projectId: projectId ?? undefined,
					})

					if (ranked.length === 0) return `No long-term memories found for "${args.query}".`

					const ids = ranked.map(r => r.id)
					const entries = getLTMByIds(db, ids)
					const entryMap = new Map(entries.map(e => [e.id, e]))

					const lines: string[] = [`=== LTM Search: "${args.query}" (${ranked.length} results) ===`, ""]
					for (const r of ranked) {
						const entry = entryMap.get(r.id)
						if (!entry) continue
						const caption = entry.caption || entry.content.slice(0, 80)
						lines.push(`  #${entry.id} [${entry.type}] — ${caption}`)
					}
					return lines.join("\n")
				},
			}),

			// Search observations (hybrid BM25 + vector)
			observation_search: tool({
				description: `Search raw observations (tool execution history from current and past sessions). Returns a compact list with IDs and titles. Use get_mem to retrieve full details.`,
				args: {
					query: tool.schema.string().describe("Search query (keywords or natural language)"),
					type: tool.schema
						.enum(["discovery", "decision", "bugfix", "feature", "refactor", "change"])
						.optional()
						.describe("Filter by observation type"),
					concepts: tool.schema.string().optional().describe("Comma-separated concepts/tags to filter by"),
					tool_name: tool.schema.string().optional().describe("Filter by tool name (e.g., 'Read', 'Bash', 'Write')"),
					session_id: tool.schema.string().optional().describe("Filter to a specific session"),
					limit: tool.schema.number().optional().describe("Max results (default 10)"),
				},
				async execute(args) {
					const limit = args.limit ?? 10
					const concepts = args.concepts ? args.concepts.split(",").map((c: string) => c.trim()).filter(Boolean) : undefined
					const ranked = await hybridSearchObservations(db, args.query, {
						limit,
						type: args.type,
						concepts,
						toolName: args.tool_name,
						sessionId: args.session_id,
						projectId: projectId ?? undefined,
					})

					if (ranked.length === 0) return `No observations found for "${args.query}".`

					const ids = ranked.map(r => r.id)
					const observations = getObservationsByIds(db, ids)
					const obsMap = new Map(observations.map(o => [o.id, o]))

					const lines: string[] = [`=== Observation Search: "${args.query}" (${ranked.length} results) ===`, ""]
					for (const r of ranked) {
						const obs = obsMap.get(r.id)
						if (!obs) continue
						lines.push(`  #${obs.id} [${obs.type}] — ${obs.title}`)
					}
					return lines.join("\n")
				},
			}),

			// Fetch full record by ID
			get_mem: tool({
				description: `Retrieve the full details of a specific memory entry by ID. Use after ltm_search or observation_search to get complete content.`,
				args: {
					source: tool.schema.enum(["ltm", "observation"]).describe("Which store to look up"),
					id: tool.schema.number().describe("The entry ID (from search results)"),
				},
				async execute(args) {
					if (args.source === "ltm") {
						const entry = getLTMById(db, args.id)
						if (!entry) return `LTM #${args.id} not found.`
						const tags = entry.tags.length > 0 ? `\nTags: ${entry.tags.join(", ")}` : ""
						const files = entry.files.length > 0 ? `\nFiles: ${entry.files.join(", ")}` : ""
						const ctx = entry.context ? `\nContext: ${entry.context}` : ""
						return [
							`=== LTM #${entry.id} [${entry.type}] ===`,
							`Caption: ${entry.caption || "(none)"}`,
							`Content: ${entry.content}`,
							`Session: ${entry.sourceSessionId || "unknown"}`,
							`Created: ${entry.createdAt} | Updated: ${entry.updatedAt}`,
							tags, files, ctx,
						].filter(Boolean).join("\n")
					} else {
						const obs = getObservationById(db, args.id)
						if (!obs) return `Observation #${args.id} not found.`
						const facts = obs.facts.length > 0 ? `\nFacts:\n${obs.facts.map((f: string) => `  - ${f}`).join("\n")}` : ""
						const concepts = obs.concepts.length > 0 ? `\nConcepts: ${obs.concepts.join(", ")}` : ""
						const filesR = obs.filesRead.length > 0 ? `\nFiles read: ${obs.filesRead.join(", ")}` : ""
						const filesM = obs.filesModified.length > 0 ? `\nFiles modified: ${obs.filesModified.join(", ")}` : ""
						return [
							`=== Observation #${obs.id} [${obs.type}] ===`,
							`Title: ${obs.title}`,
							`Narrative: ${obs.narrative}`,
							`Tool: ${obs.toolName} | Prompt #${obs.promptNumber ?? "?"}`,
							`Session: ${obs.sessionId}`,
							`Created: ${obs.createdAt}`,
							facts, concepts, filesR, filesM,
						].filter(Boolean).join("\n")
					}
				},
			}),

			// Retrieve full raw output of a tool execution (for pruned/trimmed results)
			get_tool_output: tool({
				description: `Retrieve the full original output of a tool execution that may have been trimmed or cleared by context pruning. Use this when you see "[Tool result trimmed: ...]" or "[Old tool result content cleared]" in the conversation and need the complete output (e.g., before saving important details to memory, or to review full file contents). Find the observation ID via observation_search first.`,
				args: {
					observation_id: tool.schema.number().describe("Observation ID from observation_search results (e.g., the #123 from search output)"),
				},
				async execute(args) {
					const filePath = `${TOOL_OUTPUTS_DIR}/${args.observation_id}.txt`

					if (!existsSync(filePath)) {
						const obs = getObservationById(db, args.observation_id)
						if (!obs) return `Observation #${args.observation_id} not found.`
						return `Full output for observation #${args.observation_id} is not available. Output was either too small to store (<200 chars) or has been cleaned up (>24h old).`
					}

					const content = readFileSync(filePath, "utf-8")
					const obs = getObservationById(db, args.observation_id)
					const header = obs
						? `=== Full Output: Observation #${obs.id} [${obs.type}] — ${obs.title} ===
Tool: ${obs.toolName} | Session: ${obs.sessionId} | Prompt #${obs.promptNumber ?? "?"}
`
						: `=== Full Output: Observation #${args.observation_id} ===
`

					return `${header}
${content}`
				},
			}),

			// Manually save an LTM entry
			ltm_save: tool({
				description: `Manually save an important fact, insight, or workflow to long-term memory. Use this when you discover something worth remembering permanently — a codebase pattern, deployment process, architectural decision, or user preference. The memory persists across all future sessions.`,
				args: {
					text: tool.schema.string().describe("The memory content to save"),
					type: tool.schema
						.enum(["episodic", "semantic", "procedural"])
						.optional()
						.describe("Memory type: 'episodic' (what happened), 'semantic' (facts/knowledge), 'procedural' (how-to). Defaults to 'semantic'."),
					tags: tool.schema.string().optional().describe("Comma-separated tags for searchability"),
				},
				async execute(args, context) {
					const type: LTMType = (args.type as LTMType) ?? "semantic"
					const tags = args.tags ? args.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []

					const input: CreateLTMInput = {
						type,
						content: args.text,
						caption: args.text.slice(0, 80),
						sourceSessionId: context.sessionID,
						tags,
					}

					const id = insertLTM(db, input)

				// Write LSS file
				if (memDir) try {
						writeLTMFile(memDir, id, type, args.text, tags)
					} catch { /* non-fatal */ }

					// Refresh cache so it appears immediately
					refreshContextCache()

					return `Saved to long-term memory [${type}] #${id}: "${args.text.slice(0, 80)}${args.text.length > 80 ? "..." : ""}"`
				},
			}),

			// ── Session Tools ────────────────────────────────────────────

			// Browse past sessions with metadata
			session_list: tool({
				description: `List past sessions with metadata and storage paths for cross-session context retrieval. Returns IDs, titles, timestamps, file change stats. Use session_get to retrieve a session's conversation content.`,
				args: {
					search: tool.schema.string().optional().describe("Filter sessions by title substring (case-insensitive)"),
					limit: tool.schema.number().optional().describe("Max sessions to return (default 20, most recent first)"),
				},
				async execute(args) {
					const result = await client.session.list()
					if (!result.data) return "Error: could not fetch sessions"

					let sessions = result.data as Session[]

					// Client-side title search
					if (args.search) {
						const q = args.search.toLowerCase()
						sessions = sessions.filter((s) => s.title?.toLowerCase().includes(q))
					}

					// Most recent first
					sessions.sort((a, b) => b.time.updated - a.time.updated)

					const total = sessions.length
					const limit = args.limit ?? 20
					sessions = sessions.slice(0, limit)

					if (sessions.length === 0)
						return args.search ? `No sessions matching "${args.search}".` : "No sessions found."

					const rows = sessions.map((s) => {
						const parent = s.parentID ? ` [child of ${s.parentID}]` : ""
						return `  ${s.id} | "${s.title}" | ${shortTs(s.time.created)} → ${shortTs(s.time.updated)} | ${changeSummary(s)}${parent}`
					})

					return [
						`=== SESSIONS (${sessions.length}/${total}) ===`,
						...rows,
						"",
						"=== STORAGE (for raw access via bash) ===",
						`  DB:       ${DB_PATH}`,
						`  Sessions: ${STORAGE_BASE}/storage/session/global/`,
						`  Messages: ${STORAGE_BASE}/storage/message/{session_id}/`,
						`  SQL:      sqlite3 ${DB_PATH} "SELECT id, title, created_at FROM session ORDER BY created_at DESC"`,
					].join("\n")
				},
			}),

			// Retrieve a session's conversation with TTC compression
			session_get: tool({
				description: `Retrieve a past session's conversation with semantic compression via TTC API.\nFetches all messages, pre-truncates oversized tool call I/O, then compresses via TTC bear-1.2.\n\nAggressiveness guide:\n  0.1 — light, most detail preserved (recent/important sessions)\n  0.3 — balanced default\n  0.5 — moderate\n  0.7+ — heavy, just the essence\n\nReturns: session metadata + compressed conversation + compression stats.\nUse session_list first to find session IDs.`,
				args: {
					session_id: tool.schema.string().describe("Session ID (ses_*) from session_list"),
					aggressiveness: tool.schema.number().optional().describe("Compression level 0.0-1.0 (default 0.3). Higher = more compressed."),
				},
				async execute(args) {
					const agg = Math.min(1, Math.max(0, args.aggressiveness ?? 0.3))

					// Parallel fetch: metadata + todos + messages
					const [sessionRes, todoRes, messagesRes] = await Promise.all([
						client.session.get({ path: { id: args.session_id } }),
						client.session.todo({ path: { id: args.session_id } }).catch(() => ({ data: [] as Todo[] })),
						client.session.messages({ path: { id: args.session_id } }),
					])

					if (!sessionRes.data)
						return `Error: session ${args.session_id} not found`

					const session = sessionRes.data as Session
					const todos = ((todoRes.data ?? []) as Todo[])
					const messages = messagesRes.data ?? []

					// ── Build metadata header (never compressed) ──
					const todoStr = todos.length > 0
						? todos.map((t) => `  [${t.status}] ${t.content}`).join("\n")
						: "  (none)"

					const header = [
						`=== SESSION: ${session.title} ===`,
						`ID: ${session.id}`,
						`Created: ${shortTs(session.time.created)} | Updated: ${shortTs(session.time.updated)}`,
						`Changes: ${changeSummary(session)}`,
						session.parentID ? `Parent: ${session.parentID}` : null,
						`Todos:\n${todoStr}`,
						`Storage: ${STORAGE_BASE}/storage/message/${session.id}/`,
					].filter(Boolean).join("\n")

					if (messages.length === 0) {
						return `${header}\n\n(no messages)`
					}

					// ── Format conversation ──
					const formatted = formatMessages(messages)

					// Count tool calls for stats
					let toolCallCount = 0
					for (const msg of messages) {
						for (const part of msg.parts) {
							if (part.type === "tool") toolCallCount++
						}
					}

					// ── Compress or return raw ──
					const apiKey = getEnv("TTC_API_KEY")
					if (!apiKey || formatted.length < 500) {
						const reason = !apiKey ? "TTC_API_KEY not set" : "text too short to compress"
						return [header, "", `=== CONVERSATION (${messages.length} msgs, ${toolCallCount} tool calls, uncompressed — ${reason}) ===`, formatted].join("\n")
					}

					const { output, originalTokens, compressedTokens } = await ttcCompress(formatted, agg, apiKey)
					const savings = originalTokens > 0 ? `${Math.round((1 - compressedTokens / originalTokens) * 100)}%` : "N/A"

					return [
						header,
						"",
						`=== CONVERSATION (${messages.length} msgs, ${toolCallCount} tool calls, aggressiveness=${agg}) ===`,
						output,
						"",
						`=== COMPRESSION ===`,
						`${originalTokens} tokens → ${compressedTokens} tokens (${savings} reduction)`,
					].join("\n")
				},
			}),
		},
	}
}

// ── Default export for OpenCode plugin loader ─────────────────────────────
export default KortixMemoryPlugin
