/**
 * Kortix Memory Plugin for OpenCode
 *
 * Long-term memory with episodic/semantic/procedural consolidation,
 * plus cross-session context retrieval.
 *
 * Hooks:
 *   tool.execute.before        — capture tool args by callID
 *   tool.execute.after         — extract observations from tool results
 *   chat.message               — track session + prompt count
 *   event                      — session lifecycle (created, deleted)
 *   messages.transform         — inject session ID + LTM into latest user message (cache-safe)
 *   session.compacting         — consolidate observations → LTM, inject into compaction context
 *
 * Tools:
 *   mem_search                 — unified search across observations + LTM
 *   mem_save                   — manually persist an LTM entry
 *   session_list               — browse past sessions with metadata
 *   session_get                — retrieve a session's conversation (TTC-compressed)
 */

import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Session, Todo } from "@opencode-ai/sdk"
import { initDb, insertObservation, ensureSession, incrementPromptCount, completeSession, unifiedSearch, insertLTM } from "./db"
import { extractObservation } from "./extract"
import { generateLTMBlock } from "./context"
import { consolidateMemories } from "./consolidate"
import { ensureMemDir, writeObservationFile, writeLTMFile } from "./lss"
import { getEnv, shortTs, changeSummary, formatMessages, ttcCompress, STORAGE_BASE, DB_PATH } from "./session"
import type { LogFn, CreateLTMInput, LTMType } from "./types"
import { tunnelStatusTool, tunnelFsReadTool, tunnelFsWriteTool, tunnelFsListTool, tunnelShellExecTool } from "./tunnel"
import {
	tunnelScreenshotTool,
	tunnelClickTool,
	tunnelTypeTool,
	tunnelKeyTool,
	tunnelWindowListTool,
	tunnelWindowFocusTool,
	tunnelAppLaunchTool,
	tunnelAppQuitTool,
	tunnelClipboardReadTool,
	tunnelClipboardWriteTool,
	tunnelCursorImageTool,
	tunnelMouseMoveTool,
	tunnelMouseDragTool,
	tunnelMouseScrollTool,
	tunnelScreenInfoTool,
	tunnelAxTreeTool,
	tunnelAxActionTool,
	tunnelAxSetValueTool,
	tunnelAxFocusTool,
	tunnelAxSearchTool,
} from "./tunnel-desktop"

// ─── Plugin Entry ────────────────────────────────────────────────────────────

export const KortixMemoryPlugin: Plugin = async ({ client }) => {
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
	let currentSessionId: string | null = null
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

	// Cache the LTM block — regenerated on session start and after consolidation
	let cachedLTMBlock = ""

	function refreshLTMCache(): void {
		try {
			cachedLTMBlock = generateLTMBlock(db)
		} catch (err) {
			log("warn", `[memory] LTM cache refresh failed: ${err}`)
		}
	}

	// Generate initial cache
	refreshLTMCache()

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

				const obs = extractObservation(
					{
						tool: input.tool,
						args: args as Record<string, unknown>,
						output: output.output ?? "",
						title: output.title ?? undefined,
					},
					currentSessionId,
					promptCount,
				)

				if (obs) {
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
				}
			} catch (err) {
				log("warn", `[memory] Observation extraction failed: ${err}`)
			}
		},

		// ── HOOK: Track session + prompt count ────────────────────────
		"chat.message": async (input) => {
			try {
				if (input.sessionID && input.sessionID !== currentSessionId) {
					currentSessionId = input.sessionID
					ensureSession(db, currentSessionId)
					refreshLTMCache()
				}
				if (currentSessionId) {
					promptCount = incrementPromptCount(db, currentSessionId)
				}
			} catch (err) {
				log("warn", `[memory] chat.message hook failed: ${err}`)
			}
		},

		// ── HOOK: Session lifecycle ───────────────────────────────────
		event: async ({ event }) => {
			try {
				if (event.type === "session.created") {
					const sessionId = (event as any).properties?.id
					if (sessionId) {
						currentSessionId = sessionId
						ensureSession(db, sessionId)
						promptCount = 0
						refreshLTMCache()
					}
				}

				if (event.type === "session.deleted") {
					const sessionId = (event as any).properties?.id
					if (sessionId) {
						completeSession(db, sessionId)
					}
				}
			} catch (err) {
				log("warn", `[memory] event hook failed: ${err}`)
			}
		},

		// ── HOOK: Inject session context + LTM into latest user message (cache-safe)
		// System prompt stays untouched → KV cache preserved.
		// Session ID + LTM ride on the always-new user message.
		"experimental.chat.messages.transform": async (_input, output) => {
			try {
				// Build the injected block: session context + LTM
				const parts: string[] = []

				// Always inject session ID so the agent knows its session
				if (currentSessionId) {
					parts.push(`<session_context>\nSession ID: ${currentSessionId}\n</session_context>`)
				}

				// Append LTM block if available
				if (cachedLTMBlock) {
					parts.push(cachedLTMBlock)
				}

				if (parts.length === 0) return

				const injectedBlock = parts.join("\n\n")

				const messages = output.messages
				// Find last user message and prepend context block
				for (let i = messages.length - 1; i >= 0; i--) {
					if (messages[i].info.role === "user") {
						// Prepend as a synthetic text part
						messages[i].parts.unshift({
							type: "text",
							text: injectedBlock,
						} as any)
						break
					}
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
				const result = await consolidateMemories(db, sessionId, log)

				// 2. Write LSS files for new LTM entries
				for (const mem of result.newMemories) {
					try {
						// We need the ID — re-read from DB by content match
						// (insertLTM was called inside consolidateMemories)
					} catch { /* non-fatal */ }
				}

				// 3. Refresh the LTM cache
				refreshLTMCache()

				// 4. Inject LTM block into compaction context
				if (cachedLTMBlock) {
					output.context.push(cachedLTMBlock)
				}

				log("info", `[memory] Compaction consolidation complete: ${result.newMemories.length} new, ${result.reinforcedIds.length} reinforced`)
			} catch (err) {
				log("warn", `[memory] Compaction consolidation failed: ${err}`)
			}
		},

		// ── TOOLS ─────────────────────────────────────────────────────
		tool: {

			// Unified search across observations + LTM
			mem_search: tool({
				description: `Search across all memory stores — both long-term memories (episodic/semantic/procedural knowledge) and raw observations (tool execution history). LTM results are ranked higher. Use this to recall past knowledge, find facts about the codebase, or look up what happened in previous sessions.`,
				args: {
					query: tool.schema.string().describe("Search query (keywords or natural language)"),
					limit: tool.schema.number().optional().describe("Max results (default 15)"),
					source: tool.schema
						.enum(["both", "ltm", "observation"])
						.optional()
						.describe("Filter by source: 'ltm' for long-term memories only, 'observation' for raw tool events only, 'both' (default)"),
				},
				async execute(args) {
					const results = unifiedSearch(db, args.query, {
						limit: args.limit ?? 15,
						source: args.source as any ?? "both",
					})

					if (results.length === 0) {
						return `No memories found for "${args.query}".`
					}

					const lines: string[] = [`=== Memory Search: "${args.query}" (${results.length} results) ===`, ""]

					for (const hit of results) {
						const sourceTag = hit.source === "ltm" ? `[LTM/${hit.type}]` : `[obs/${hit.type}]`
						const confidence = hit.confidence != null ? ` (confidence: ${hit.confidence.toFixed(2)})` : ""
						const files = hit.files.length > 0 ? `\n    Files: ${hit.files.slice(0, 3).join(", ")}` : ""
						lines.push(`  ${sourceTag} #${hit.id}${confidence}`)
						lines.push(`    ${hit.content.slice(0, 200)}${files}`)
						lines.push("")
					}

					return lines.join("\n")
				},
			}),

			// Manually save an LTM entry
			mem_save: tool({
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
						sourceSessionId: context.sessionID,
						tags,
						confidence: 1.0,
					}

					const id = insertLTM(db, input)

				// Write LSS file
				if (memDir) try {
						writeLTMFile(memDir, id, type, args.text, tags)
					} catch { /* non-fatal */ }

					// Refresh cache so it appears immediately
					refreshLTMCache()

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
			// ── Tunnel Tools ────────────────────────────────────────────
			tunnel_status: tunnelStatusTool,
			tunnel_fs_read: tunnelFsReadTool,
			tunnel_fs_write: tunnelFsWriteTool,
			tunnel_fs_list: tunnelFsListTool,
			tunnel_shell_exec: tunnelShellExecTool,
			tunnel_screenshot: tunnelScreenshotTool,
			tunnel_click: tunnelClickTool,
			tunnel_type: tunnelTypeTool,
			tunnel_key: tunnelKeyTool,
			tunnel_window_list: tunnelWindowListTool,
			tunnel_window_focus: tunnelWindowFocusTool,
			tunnel_app_launch: tunnelAppLaunchTool,
			tunnel_app_quit: tunnelAppQuitTool,
			tunnel_clipboard_read: tunnelClipboardReadTool,
			tunnel_clipboard_write: tunnelClipboardWriteTool,
			tunnel_cursor_image: tunnelCursorImageTool,
			tunnel_mouse_move: tunnelMouseMoveTool,
			tunnel_mouse_drag: tunnelMouseDragTool,
			tunnel_mouse_scroll: tunnelMouseScrollTool,
			tunnel_screen_info: tunnelScreenInfoTool,
			tunnel_ax_tree: tunnelAxTreeTool,
			tunnel_ax_action: tunnelAxActionTool,
			tunnel_ax_set_value: tunnelAxSetValueTool,
			tunnel_ax_focus: tunnelAxFocusTool,
			tunnel_ax_search: tunnelAxSearchTool,
		},
	}
}

// ── Default export for OpenCode plugin loader ─────────────────────────────
export default KortixMemoryPlugin
