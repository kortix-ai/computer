/**
 * Kortix Autowork Plugin — Concurrent Session Support
 *
 * Autonomous work continuation with full concurrency: every session gets its
 * own independent autowork loop state, passive continuation state, and config
 * overrides. No session can stomp another.
 *
 * Architecture:
 *   - All state is stored in Maps keyed by session ID.
 *   - Persistence is per-session: .kortix/loop-states/{sessionId}.json
 *   - Stale sessions are cleaned up on session.deleted events and via
 *     periodic GC (TTL-based eviction for sessions that never got deleted).
 *
 * Activation:
 *   - /autowork slash command (KORTIX_AUTOWORK marker)
 *   - Keywords in user messages: autowork, ultrawork, ulw, hyperwork, gigawork
 *
 * Stop:
 *   - /autowork-stop (KORTIX_AUTOWORK_STOP marker) — ONLY way to kill the loop.
 *     Permanent within the session. (Use /autowork again to re-start.)
 *
 * Loop persistence:
 *   - Once active, the loop SURVIVES new user messages.
 *   - Human can add context mid-loop; agent absorbs it and keeps going.
 *   - messageCountAtStart is NOT reset — full promise history preserved.
 *
 * Robustness:
 *   - Exponential backoff on failures: baseCooldown * 2^min(failures, 5)
 *   - 5-minute hard pause after 5 consecutive failures (auto-resets)
 *   - Scans ALL assistant messages since loop start for promises
 *   - Abort grace period, pending question detection, internal marker
 *
 * Hooks:
 *   chat.message  — keyword/command detection, loop state management
 *   event         — session.idle (evaluate + inject), session.error/aborted
 *                   (grace period), session.deleted (cleanup)
 */

import type { Plugin } from "@opencode-ai/plugin"
import type { Todo } from "@opencode-ai/sdk"
import {
	type ContinuationConfig,
	type ContinuationState,
	type LoopState,
	DEFAULT_CONFIG,
	createInitialState,
	createInitialLoopState,
	mergeConfig,
	AUTOWORK_KEYWORDS,
	INTERNAL_MARKER,
	CODE_BLOCK_PATTERN,
	INLINE_CODE_PATTERN,
} from "./src/config"
import { evaluate } from "./src/continuation-engine"
import {
	evaluateLoop,
	startLoop,
	stopLoop,
	markStopped,
	recordAbort,
	advanceIteration,
	recordFailure,
	enterVerification,
	checkLoopSafetyGates,
	loadPersistedLoopState,
	loadAllPersistedLoopStates,
	persistLoopState,
	removePersistedLoopState,
} from "./src/loop"

// ─── Helpers ──────────────────────────────────────────────────────────────────

type LogFn = (level: "info" | "warn" | "error", message: string) => void

function extractMessageText(input: any): string {
	const parts = input?.parts ?? []
	let text = ""
	for (const part of parts) {
		if (typeof part === "string") text += part
		else if (part?.type === "text") text += part.text ?? ""
		else if (typeof part?.text === "string") text += part.text
	}
	return text
}

/** Strip code blocks and HTML comments before keyword detection */
function cleanTextForKeywordDetection(text: string): string {
	return text
		.replace(CODE_BLOCK_PATTERN, "")
		.replace(INLINE_CODE_PATTERN, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.trim()
}

/** Check if a message text was injected by the system (contains internal marker) */
function isInternalMessage(text: string): boolean {
	return text.includes(INTERNAL_MARKER) ||
		text.includes("[SYSTEM REMINDER") ||
		text.includes("<!-- KORTIX")
}

/** Extract all assistant message texts from a messages array since a given index. */
function extractAssistantTexts(messages: any[], fromIndex: number = 0): string[] {
	const texts: string[] = []
	for (let i = fromIndex; i < messages.length; i++) {
		const msg = messages[i]
		if (msg?.info?.role === "assistant") {
			let text = ""
			for (const part of (msg.parts ?? [])) {
				if (part.type === "text" && !part.synthetic && !part.ignored) {
					text += part.text + "\n"
				}
			}
			if (text.trim()) texts.push(text.trim())
		}
	}
	return texts
}

/** Extract last assistant message text + tool call flag for passive continuation */
function extractLastAssistantMessage(messages: any[]): { text: string; hadToolCalls: boolean } {
	let text = ""
	let hadToolCalls = false
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		if (msg?.info?.role === "assistant") {
			for (const part of (msg.parts ?? [])) {
				if (part.type === "text" && !part.synthetic && !part.ignored) {
					text += part.text + "\n"
				}
				if (part.type === "tool") hadToolCalls = true
			}
			break
		}
	}
	return { text: text.trim(), hadToolCalls }
}

/**
 * Detect if agent is waiting for a user answer to a `question` tool call.
 * Walks backwards through messages — returns true if an assistant `question`
 * tool call is found before any subsequent user message.
 */
function hasPendingQuestion(messages: any[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		const role = msg?.info?.role
		if (role === "user") return false
		if (role === "assistant") {
			for (const part of (msg.parts ?? [])) {
				if (part.type === "tool") {
					const toolName = (part.toolName ?? part.tool_name ?? part.name ?? "") as string
					if (toolName === "question" || toolName === "mcp_question") {
						const status = part.state?.status ?? ""
						if (status === "running" || status === "pending") return true
					}
				}
			}
		}
	}
	return false
}

// ─── Per-Session State Manager ────────────────────────────────────────────────

/** Max age (ms) before an inactive session's in-memory state is evicted. 2 hours. */
const SESSION_STATE_TTL_MS = 2 * 60 * 60 * 1000

interface SessionEntry<T> {
	state: T
	lastAccessedAt: number
}

/**
 * TTL-guarded Map for per-session state. Entries are evicted after SESSION_STATE_TTL_MS
 * of inactivity to prevent unbounded memory growth.
 */
class SessionStateMap<T> {
	private map = new Map<string, SessionEntry<T>>()
	private lastGcAt = Date.now()
	private readonly gcIntervalMs = 10 * 60 * 1000 // run GC at most every 10 min

	constructor(private readonly factory: (sessionId: string) => T) {}

	/** Get or create state for a session, resetting the TTL timer. */
	get(sessionId: string): T {
		this.maybeGc()
		let entry = this.map.get(sessionId)
		if (!entry) {
			entry = { state: this.factory(sessionId), lastAccessedAt: Date.now() }
			this.map.set(sessionId, entry)
		} else {
			entry.lastAccessedAt = Date.now()
		}
		return entry.state
	}

	/** Overwrite state for a session. */
	set(sessionId: string, state: T): void {
		this.map.set(sessionId, { state, lastAccessedAt: Date.now() })
	}

	/** Check if a session has state (without creating it). */
	has(sessionId: string): boolean {
		return this.map.has(sessionId)
	}

	/** Peek at state without creating or resetting TTL. */
	peek(sessionId: string): T | undefined {
		return this.map.get(sessionId)?.state
	}

	/** Delete a session's state. */
	delete(sessionId: string): void {
		this.map.delete(sessionId)
	}

	/** Number of tracked sessions. */
	get size(): number {
		return this.map.size
	}

	/** Evict entries that haven't been accessed within the TTL window. */
	private maybeGc(): void {
		const now = Date.now()
		if (now - this.lastGcAt < this.gcIntervalMs) return
		this.lastGcAt = now
		const cutoff = now - SESSION_STATE_TTL_MS
		for (const [key, entry] of this.map) {
			if (entry.lastAccessedAt < cutoff) {
				this.map.delete(key)
			}
		}
	}
}

// ─── Plugin Entry ─────────────────────────────────────────────────────────────

const KortixContinuationPlugin: Plugin = async ({ client }) => {
	const config: ContinuationConfig = mergeConfig(DEFAULT_CONFIG)

	// Per-session state — each session gets independent, TTL-managed state
	const loopStates = new SessionStateMap<LoopState>(
		(_sid) => createInitialLoopState(),
	)
	const continuationStates = new SessionStateMap<ContinuationState>(
		(sid) => { const s = createInitialState(); s.sessionId = sid; return s },
	)
	// Per-session config overrides (e.g., continuation disabled by /autowork-stop)
	const sessionConfigOverrides = new Map<string, Partial<ContinuationConfig["features"]>>()

	// Recover persisted loop states on startup
	try {
		const persisted = loadAllPersistedLoopStates()
		for (const [sid, state] of persisted) {
			if (state.active && !state.stopped) {
				loopStates.set(sid, state)
			}
		}
	} catch { /* non-fatal */ }

	const log: LogFn = (level, message) => {
		try {
			client.app.log({
				body: { service: "kortix-autowork", level, message },
			}).catch(() => {})
		} catch { /* non-fatal */ }
	}

	/** Short session ID for log readability */
	const sid = (sessionId: string) => sessionId.length > 16 ? sessionId.slice(-12) : sessionId

	return {
		// ── HOOK: chat.message ────────────────────────────────────────────────
		"chat.message": async (input: any, output: any) => {
			try {
				const sessionId = input?.sessionID
				if (!sessionId) return

				const messageText = extractMessageText(output)
				if (!messageText) return

				// Skip system-injected messages (never act on our own prompts)
				if (isInternalMessage(messageText)) return

				// Get per-session states
				let loopState = loopStates.get(sessionId)
				const contState = continuationStates.get(sessionId)

				// Reset passive continuation state on new user message
				contState.workCycleStartedAt = Date.now()
				contState.consecutiveAborts = 0
				contState.inflight = false

				const cleanText = cleanTextForKeywordDetection(messageText)

				// ── /autowork-stop — kill the loop, permanent within session ──
				if (messageText.includes("KORTIX_AUTOWORK_STOP") || /\/autowork-stop\b/.test(messageText)) {
					if (loopState.active) loopState = stopLoop(loopState)
					loopState = markStopped(loopState)
					loopStates.set(sessionId, loopState)
					sessionConfigOverrides.set(sessionId, { continuation: false })
					log("info", `[autowork][${sid(sessionId)}] Permanently stopped — use /autowork to restart`)
					return
				}

				// ── /autowork — start or append to loop ──────────────────────
				if (messageText.includes("KORTIX_AUTOWORK") || /\/autowork\b/.test(messageText)) {
					const task = messageText
						.replace(/^.*?\/autowork\s*/i, "")
						.replace(/<!--[\s\S]*?-->/g, "")
						.trim() || "Unspecified task"

					if (loopState.active) {
						// Append context to running loop
						const updatedPrompt = loopState.taskPrompt
							? `${loopState.taskPrompt}\n\n[User added context at iteration ${loopState.iteration}]: ${task}`
							: task
						loopState = { ...loopState, taskPrompt: updatedPrompt }
						persistLoopState(loopState)
						loopStates.set(sessionId, loopState)
						log("info", `[autowork][${sid(sessionId)}] Context appended mid-loop`)
					} else {
						// Fresh start — clear any previous stop
						sessionConfigOverrides.delete(sessionId)
						let msgCount = 0
						try {
							const r = await client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] }))
							msgCount = (r.data ?? []).length
						} catch { /* non-fatal */ }
						loopState = startLoop(task, sessionId, msgCount)
						loopStates.set(sessionId, loopState)
						log("info", `[autowork][${sid(sessionId)}] Activated: "${task.slice(0, 80)}"`)
					}

					if (output?.message && typeof output.message === "object") {
						output.message.variant = "max"
					}
					return
				}

				// ── Keyword auto-activation ───────────────────────────────────
				if (AUTOWORK_KEYWORDS.test(cleanText)) {
					if (!loopState.active) {
						const task = cleanText.replace(AUTOWORK_KEYWORDS, "").trim() || messageText.trim()
						sessionConfigOverrides.delete(sessionId)
						let msgCount = 0
						try {
							const r = await client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] }))
							msgCount = (r.data ?? []).length
						} catch { /* non-fatal */ }
						loopState = startLoop(task, sessionId, msgCount)
						loopStates.set(sessionId, loopState)
						log("info", `[autowork][${sid(sessionId)}] Keyword-activated: "${task.slice(0, 80)}"`)
					}
					if (output?.message && typeof output.message === "object") {
						output.message.variant = "max"
					}
					return
				}

				// ── Active loop absorbs user message ─────────────────────────
				if (loopState.active) {
					const updatedPrompt = loopState.taskPrompt
						? `${loopState.taskPrompt}\n\n[User message at iteration ${loopState.iteration}]: ${messageText.slice(0, 500)}`
						: messageText.slice(0, 500)
					loopState = { ...loopState, taskPrompt: updatedPrompt }
					persistLoopState(loopState)
					loopStates.set(sessionId, loopState)
					log("info", `[autowork][${sid(sessionId)}] User message absorbed (iter ${loopState.iteration})`)
				}
			} catch { /* non-fatal */ }
		},

		// ── HOOK: event ───────────────────────────────────────────────────────
		event: async ({ event }) => {
			try {
				// ── Session cleanup on delete ────────────────────────────────
				if (event.type === "session.deleted") {
					const sessionId = (event as any).properties?.info?.id ?? (event as any).properties?.sessionID
					if (sessionId) {
						loopStates.delete(sessionId)
						continuationStates.delete(sessionId)
						sessionConfigOverrides.delete(sessionId)
						removePersistedLoopState(sessionId)
						log("info", `[autowork][${sid(sessionId)}] Session deleted — state cleaned up`)
					}
					return
				}

				// ── Abort events — record grace period ───────────────────────
				if (event.type === "session.error" || (event.type as string) === "session.aborted") {
					const sessionId = (event as any).properties?.sessionID
					if (!sessionId) return

					// Loop state: record abort for grace period
					if (loopStates.has(sessionId)) {
						const ls = loopStates.get(sessionId)
						if (ls.active) {
							loopStates.set(sessionId, recordAbort(ls))
							log("info", `[autowork][${sid(sessionId)}] Abort recorded — grace period active`)
						}
					}

					// Continuation state: track for circuit breaker
					const cs = continuationStates.get(sessionId)
					cs.lastAbortAt = Date.now()
					cs.consecutiveAborts++
					cs.inflight = false
					return
				}

				// ── session.idle — main evaluation point ─────────────────────
				if (event.type !== "session.idle") return

				const sessionId = (event as any).properties?.sessionID
				if (!sessionId) return

				let loopState = loopStates.get(sessionId)

				// Attempt filesystem recovery if no active in-memory loop
				if (!loopState.active) {
					try {
						const persisted = loadPersistedLoopState(sessionId)
						if (persisted?.active && !persisted.stopped) {
							loopState = persisted
							loopStates.set(sessionId, loopState)
							log("info", `[autowork][${sid(sessionId)}] Recovered loop from filesystem`)
						}
					} catch { /* non-fatal */ }
				}

				// ── Priority 1: Active autowork loop ─────────────────────────
				if (loopState.active) {
					try {
						const thresholds = config.thresholds

						// Safety gates
						const gateResult = checkLoopSafetyGates(
							loopState,
							thresholds.abortGracePeriodMs,
							thresholds.maxConsecutiveFailures,
							thresholds.failureResetWindowMs,
							thresholds.baseCooldownMs,
						)

						if (gateResult === "__reset_failures__") {
							loopState = { ...loopState, consecutiveFailures: 0 }
							loopStates.set(sessionId, loopState)
							log("info", `[autowork][${sid(sessionId)}] Failure count reset after recovery window`)
						} else if (gateResult) {
							log("info", `[autowork][${sid(sessionId)}] Gate: ${gateResult}`)
							return
						}

						// Fetch messages AND todos in parallel
						const [messagesRes, loopTodoRes] = await Promise.all([
							client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] })),
							client.session.todo({ path: { id: sessionId } }).catch(() => ({ data: [] as Todo[] })),
						])
						const messages = (messagesRes.data ?? []) as any[]
						const loopTodos = (loopTodoRes.data ?? []) as Todo[]

						// Skip if agent is waiting for question answer
						if (hasPendingQuestion(messages)) {
							log("info", `[autowork][${sid(sessionId)}] Skipped: pending question`)
							return
						}

						// Evaluate loop decision
						const allTexts = extractAssistantTexts(messages, loopState.messageCountAtStart)
						const decision = evaluateLoop(loopState, allTexts, loopTodos)
						log("info", `[autowork][${sid(sessionId)}] ${decision.action} — ${decision.reason}`)

						if (decision.action === "verify" && decision.prompt) {
							loopState = advanceIteration(enterVerification(loopState))
							loopStates.set(sessionId, loopState)
							await client.session.promptAsync({
								path: { id: sessionId },
								body: { parts: [{ type: "text" as const, text: decision.prompt }] },
							}).catch((err: unknown) => {
								log("warn", `[autowork][${sid(sessionId)}] promptAsync failed: ${err}`)
								loopState = recordFailure(loopState)
								loopStates.set(sessionId, loopState)
							})
						} else if (decision.action === "continue" && decision.prompt) {
							loopState = advanceIteration(loopState)
							loopStates.set(sessionId, loopState)
							await client.session.promptAsync({
								path: { id: sessionId },
								body: { parts: [{ type: "text" as const, text: decision.prompt }] },
							}).catch((err: unknown) => {
								log("warn", `[autowork][${sid(sessionId)}] promptAsync failed: ${err}`)
								loopState = recordFailure(loopState)
								loopStates.set(sessionId, loopState)
							})
						} else if (decision.action === "stop") {
							loopState = stopLoop(loopState)
							loopStates.set(sessionId, loopState)
							log("info", `[autowork][${sid(sessionId)}] Complete: ${decision.reason}`)
						}
					} catch (err) {
						log("warn", `[autowork][${sid(sessionId)}] Evaluation error: ${err}`)
						loopState = recordFailure(loopState)
						loopStates.set(sessionId, loopState)
					}
					return
				}

				// ── Priority 2: Passive continuation ─────────────────────────
				const overrides = sessionConfigOverrides.get(sessionId)
				const continuationEnabled = overrides?.continuation ?? config.features.continuation
				if (!continuationEnabled) return
				if (loopState.stopped) return

				const contState = continuationStates.get(sessionId)

				try {
					const [todoRes, messagesRes] = await Promise.all([
						client.session.todo({ path: { id: sessionId } }).catch(() => ({ data: [] as Todo[] })),
						client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] })),
					])

					const todos = (todoRes.data ?? []) as Todo[]
					const messages = (messagesRes.data ?? []) as any[]

					if (hasPendingQuestion(messages)) {
						log("info", `[autowork/passive][${sid(sessionId)}] Skipped: pending question`)
						return
					}

					const { text, hadToolCalls } = extractLastAssistantMessage(messages)

					// Track empty/aborted responses for circuit breaker
					if (!text.trim() && !hadToolCalls) {
						contState.consecutiveAborts++
					} else {
						contState.consecutiveAborts = 0
					}

					const decision = evaluate(config, contState, text, hadToolCalls, todos)
					log("info", `[autowork/passive][${sid(sessionId)}] ${decision.action} — ${decision.reason}`)

					if (decision.action === "continue" && decision.prompt) {
						contState.inflight = true
						contState.totalSessionContinuations++
						contState.lastContinuationAt = Date.now()
						await client.session.promptAsync({
							path: { id: sessionId },
							body: { parts: [{ type: "text" as const, text: decision.prompt }] },
						}).catch((err: unknown) => {
							log("warn", `[autowork/passive][${sid(sessionId)}] promptAsync failed: ${err}`)
						}).finally(() => {
							contState.inflight = false
						})
					}
				} catch (err) {
					log("warn", `[autowork/passive][${sid(sessionId)}] Error: ${err}`)
					contState.inflight = false
				}
			} catch (err) {
				log("warn", `[autowork] event hook error: ${err}`)
			}
		},
	}
}

export default KortixContinuationPlugin
