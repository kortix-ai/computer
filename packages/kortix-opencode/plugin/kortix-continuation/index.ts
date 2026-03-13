/**
 * Kortix Autowork Plugin
 *
 * Autonomous work continuation — a single unified "autowork" loop that runs
 * until the agent emits <promise>DONE</promise> + <promise>VERIFIED</promise>.
 *
 * Activation:
 *   - /autowork slash command (KORTIX_AUTOWORK marker)
 *   - Keywords in user messages: autowork, ultrawork, ulw, hyperwork, gigawork
 *
 * Stop:
 *   - /autowork-stop (KORTIX_AUTOWORK_STOP marker) — temporary, clears on next user message
 *
 * Robustness:
 *   - Exponential backoff on failures: baseCooldown * 2^min(failures, 5)
 *   - 5-minute hard pause after 5 consecutive failures (auto-resets)
 *   - Scans ALL assistant messages since loop start for promises (not just last)
 *   - Abort grace period: skip continuation for 3s after abort events
 *   - Pending question detection: skip if agent is awaiting user answer
 *   - Internal marker on injected prompts prevents keyword re-triggering
 *   - Stop is temporary: next user message re-enables continuation
 *
 * Hooks:
 *   chat.message  — keyword detection + auto-activation, command detection,
 *                   stop-guard clear on new user message, variant=max on keywords
 *   event         — session.idle: evaluate active loop or passive continuation,
 *                   inject promptAsync when work should continue
 *                   session.error/aborted: record abort for grace period
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
	clearStopped,
	recordAbort,
	advanceIteration,
	recordFailure,
	enterVerification,
	checkLoopSafetyGates,
	loadPersistedLoopState,
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

/**
 * Extract all assistant message texts from a messages array since a given index.
 */
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
		if (role === "user") return false  // user responded → no pending question
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

// ─── Plugin Entry ─────────────────────────────────────────────────────────────

const KortixContinuationPlugin: Plugin = async ({ client }) => {
	let currentSessionId: string | null = null
	let continuationConfig: ContinuationConfig = mergeConfig(DEFAULT_CONFIG)
	const continuationState: ContinuationState = createInitialState()
	let loopState: LoopState = createInitialLoopState()

	// Recover persisted loop state on startup
	try {
		const persisted = loadPersistedLoopState()
		if (persisted?.active && !persisted.stopped) {
			loopState = persisted
		}
	} catch { /* non-fatal */ }

	const log: LogFn = (level, message) => {
		try {
			client.app.log({
				body: { service: "kortix-autowork", level, message },
			}).catch(() => {})
		} catch { /* non-fatal */ }
	}

	return {
		// ── HOOK: chat.message ────────────────────────────────────────────────────
		// OpenCode calls this as chat.message(input, output) — two separate args.
		// input = { sessionID, agent, model, messageID } (NO parts)
		// output = { parts: Part[], message: {...} }  (parts live here)
		"chat.message": async (input: any, output: any) => {
			try {
				// Track session ID
				const sessionId = input?.sessionID ?? currentSessionId
				if (sessionId) currentSessionId = sessionId

				// Reset work cycle timing on new user message
				continuationState.workCycleStartedAt = Date.now()
				if (currentSessionId && continuationState.sessionId !== currentSessionId) {
					continuationState.sessionId = currentSessionId
					continuationState.totalSessionContinuations = 0
				}

				// Clear stopped state on any new user message (stop is temporary)
				if (loopState.stopped && currentSessionId) {
					loopState = clearStopped(loopState)
					log("info", "[autowork] Stop cleared — re-enabled on new user message")
				}

				// Text lives in output.parts, not input
				const messageText = extractMessageText(output)
				if (!messageText || !currentSessionId) return

				// Skip if this is a system-injected message
				if (isInternalMessage(messageText)) return

				const cleanText = cleanTextForKeywordDetection(messageText)

				// ── Stop command ──
				if (messageText.includes("KORTIX_AUTOWORK_STOP") || /\/autowork-stop\b/.test(messageText)) {
					loopState = markStopped(loopState)
					if (loopState.active) loopState = stopLoop(loopState)
					continuationConfig.features.continuation = false
					log("info", "[autowork] Stopped via /autowork-stop")
					return
				}

				// ── Autowork command (slash command) ──
				if (messageText.includes("KORTIX_AUTOWORK") || /\/autowork\b/.test(messageText)) {
					const task = messageText
						.replace(/^.*?\/autowork\s*/i, "")
						.replace(/<!--[\s\S]*?-->/g, "")
						.trim() || "Unspecified task"

					let msgCount = 0
					try {
						const r = await client.session.messages({ path: { id: currentSessionId } }).catch(() => ({ data: [] as any[] }))
						msgCount = (r.data ?? []).length
					} catch { /* non-fatal */ }

					loopState = startLoop(task, currentSessionId, msgCount)
					log("info", `[autowork] Activated via /autowork: "${task.slice(0, 80)}"`)

					// Max-thinking mode on explicit command
					if (output?.message && typeof output.message === "object") {
						output.message.variant = "max"
					}
					return
				}

				// ── Keyword auto-activation ──
				if (AUTOWORK_KEYWORDS.test(cleanText)) {
					if (!loopState.active) {
						const task = cleanText.replace(AUTOWORK_KEYWORDS, "").trim() || messageText.trim()

						let msgCount = 0
						try {
							const r = await client.session.messages({ path: { id: currentSessionId } }).catch(() => ({ data: [] as any[] }))
							msgCount = (r.data ?? []).length
						} catch { /* non-fatal */ }

						loopState = startLoop(task, currentSessionId, msgCount)
						log("info", `[autowork] Auto-activated by keyword: "${task.slice(0, 80)}"`)
					} else {
						log("info", "[autowork] Keyword detected — loop already active")
					}

					// Always set variant=max for autowork keywords
					if (output?.message && typeof output.message === "object") {
						output.message.variant = "max"
					}
				}
			} catch { /* non-fatal */ }
		},

		// ── HOOK: event ───────────────────────────────────────────────────────────
		event: async ({ event }) => {
			try {
				// Track new sessions
				if (event.type === "session.created") {
					const sid = (event as any).properties?.info?.id
					if (sid) currentSessionId = sid
				}

				// Record abort events for grace period
				if (event.type === "session.error" || (event.type as string) === "session.aborted") {
					if (loopState.active) {
						loopState = recordAbort(loopState)
						log("info", "[autowork] Abort recorded — grace period active")
					}
				}

				if (event.type !== "session.idle") return

				const sessionId = (event as any).properties?.sessionID ?? currentSessionId
				if (!sessionId) return

				// Attempt filesystem recovery if loop is inactive
				if (!loopState.active) {
					try {
						const persisted = loadPersistedLoopState()
						if (persisted?.active && !persisted.stopped) {
							loopState = persisted
							log("info", "[autowork] Recovered active loop from filesystem")
						}
					} catch { /* non-fatal */ }
				}

				// ── Priority 1: Active autowork loop ──────────────────────────────
				if (loopState.active) {
					try {
						const thresholds = continuationConfig.thresholds

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
							log("info", "[autowork] Failure count reset after recovery window")
						} else if (gateResult) {
							log("info", `[autowork] Gate: ${gateResult}`)
							return
						}

					// Fetch messages AND todos in parallel — todos needed for DONE enforcement
					const [messagesRes, loopTodoRes] = await Promise.all([
						client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] })),
						client.session.todo({ path: { id: sessionId } }).catch(() => ({ data: [] as Todo[] })),
					])
					const messages = (messagesRes.data ?? []) as any[]
					const loopTodos = (loopTodoRes.data ?? []) as Todo[]

					// Skip if agent is waiting for question answer
					if (hasPendingQuestion(messages)) {
						log("info", "[autowork] Skipped: pending question")
						return
					}

					// Extract ALL assistant texts since loop start
					const allTexts = extractAssistantTexts(messages, loopState.messageCountAtStart)
					const loopDecision = evaluateLoop(loopState, allTexts, loopTodos)
						log("info", `[autowork] ${loopDecision.action} — ${loopDecision.reason}`)

						if (loopDecision.action === "verify" && loopDecision.prompt) {
							loopState = enterVerification(loopState)
							loopState = advanceIteration(loopState)
							await client.session.promptAsync({
								path: { id: sessionId },
								body: { parts: [{ type: "text" as const, text: loopDecision.prompt }] },
							}).catch((err: unknown) => {
								log("warn", `[autowork] promptAsync failed: ${err}`)
								loopState = recordFailure(loopState)
							})

						} else if (loopDecision.action === "continue" && loopDecision.prompt) {
							loopState = advanceIteration(loopState)
							await client.session.promptAsync({
								path: { id: sessionId },
								body: { parts: [{ type: "text" as const, text: loopDecision.prompt }] },
							}).catch((err: unknown) => {
								log("warn", `[autowork] promptAsync failed: ${err}`)
								loopState = recordFailure(loopState)
							})

						} else if (loopDecision.action === "stop") {
							loopState = stopLoop(loopState)
							log("info", `[autowork] Complete: ${loopDecision.reason}`)
						}
					} catch (err) {
						log("warn", `[autowork] Evaluation error: ${err}`)
						loopState = recordFailure(loopState)
					}
					return
				}

				// ── Priority 2: Passive continuation ──────────────────────────────
				if (!continuationConfig.features.continuation) return
				if (loopState.stopped) return

				try {
					const [todoRes, messagesRes] = await Promise.all([
						client.session.todo({ path: { id: sessionId } }).catch(() => ({ data: [] as Todo[] })),
						client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] })),
					])

					const todos = (todoRes.data ?? []) as Todo[]
					const messages = (messagesRes.data ?? []) as any[]

					if (hasPendingQuestion(messages)) {
						log("info", "[autowork/passive] Skipped: pending question")
						return
					}

					const { text, hadToolCalls } = extractLastAssistantMessage(messages)
					const decision = evaluate(continuationConfig, continuationState, text, hadToolCalls, todos)
					log("info", `[autowork/passive] ${decision.action} — ${decision.reason}`)

					if (decision.action === "continue" && decision.prompt) {
						continuationState.totalSessionContinuations++
						await client.session.promptAsync({
							path: { id: sessionId },
							body: { parts: [{ type: "text" as const, text: decision.prompt }] },
						}).catch((err: unknown) => {
							log("warn", `[autowork/passive] promptAsync failed: ${err}`)
						})
					}
				} catch (err) {
					log("warn", `[autowork/passive] Error: ${err}`)
				}
			} catch (err) {
				log("warn", `[autowork] event hook error: ${err}`)
			}
		},
	}
}

export default KortixContinuationPlugin
