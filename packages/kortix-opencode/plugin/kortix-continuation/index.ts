/**
 * Kortix Continuation Plugin for OpenCode
 *
 * Autonomous work continuation — loops, ultrawork mode, and passive
 * continuation. Evaluates on session.idle whether to inject a follow-up
 * prompt based on active loops, incomplete todos, and intent classification.
 *
 * Hooks:
 *   chat.message  — detect loop commands (/work-loop, /ulw-loop, /stop-continuation),
 *                   reset continuation counters on new user messages
 *   event         — session.idle → evaluate active loops or passive continuation,
 *                   inject promptAsync when work should continue
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
	evaluate,
	activateUltrawork,
	deactivateUltrawork,
	evaluateLoop,
	startLoop,
	stopLoop,
	advanceIteration,
	enterVerification,
	loadPersistedLoopState,
} from "./src"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
				if (part.type === "tool") {
					hadToolCalls = true
				}
			}
			break
		}
	}
	return { text: text.trim(), hadToolCalls }
}

// ─── Plugin Entry ────────────────────────────────────────────────────────────

const KortixContinuationPlugin: Plugin = async ({ client }) => {
	let currentSessionId: string | null = null
	let continuationConfig: ContinuationConfig = mergeConfig(DEFAULT_CONFIG)
	const continuationState: ContinuationState = createInitialState()
	let loopState: LoopState = createInitialLoopState()

	// Recover persisted loop state on startup
	try {
		const persisted = loadPersistedLoopState()
		if (persisted?.active) {
			loopState = persisted
		}
	} catch { /* non-fatal */ }

	const log: LogFn = (level, message) => {
		try {
			client.app.log({
				body: { service: "kortix-continuation", level, message },
			}).catch(() => {})
		} catch { /* non-fatal */ }
	}

	return {
		// ── HOOK: Detect loop commands + reset counters ───────────────
		"chat.message": async ({ input }) => {
			try {
				// Track session ID from input metadata
				const sessionId = (input as any).sessionID ?? currentSessionId
				if (sessionId) currentSessionId = sessionId

				// Reset continuation counters on new user message
				continuationState.consecutiveContinuations = 0
				continuationState.workCycleStartedAt = Date.now()
				if (currentSessionId && continuationState.sessionId !== currentSessionId) {
					continuationState.sessionId = currentSessionId
					continuationState.totalSessionContinuations = 0
				}

				// Detect loop commands
				const messageText = extractMessageText(input)
				if (messageText && currentSessionId) {
					if (messageText.includes("KORTIX_LOOP:work") || /\/work-loop\b/.test(messageText)) {
						const task = messageText
							.replace(/^.*?\/work-loop\s*/, "")
							.replace(/<!--.*?-->/g, "")
							.trim() || "Unspecified task"
						loopState = startLoop("work", task, currentSessionId)
						log("info", `[loop] Work loop activated: "${task}"`)
					} else if (messageText.includes("KORTIX_LOOP:ulw") || /\/ulw-loop\b/.test(messageText)) {
						const task = messageText
							.replace(/^.*?\/ulw-loop\s*/, "")
							.replace(/<!--.*?-->/g, "")
							.trim() || "Unspecified task"
						loopState = startLoop("ulw", task, currentSessionId)
						log("info", `[loop] ULW loop activated: "${task}"`)
					} else if (messageText.includes("KORTIX_LOOP_STOP") || /\/stop-continuation\b/.test(messageText)) {
						loopState = stopLoop(loopState)
						continuationConfig.features.continuation = false
						log("info", `[loop] All continuation stopped`)
					}
				}
			} catch { /* non-fatal */ }
		},

		// ── HOOK: Session lifecycle + idle evaluation ─────────────────
		event: async ({ event }) => {
			try {
				if (event.type === "session.created") {
					const sessionId = (event as any).properties?.info?.id
					if (sessionId) currentSessionId = sessionId
				}

				if (event.type === "session.idle") {
					const sessionId = (event as any).properties?.sessionID ?? currentSessionId
					if (!sessionId) return

					// Recover loop state from filesystem if needed
					if (!loopState.active) {
						try {
							const persisted = loadPersistedLoopState()
							if (persisted?.active) {
								loopState = persisted
								log("info", `[loop] Recovered active ${persisted.mode} loop from filesystem`)
							}
						} catch { /* non-fatal */ }
					}

					// ── Priority 1: Active loop evaluation ──
					if (loopState.active) {
						try {
							const messagesRes = await client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] }))
							const messages = (messagesRes.data ?? []) as any[]
							const { text } = extractLastAssistantMessage(messages)

							const loopDecision = evaluateLoop(loopState, text)
							log("info", `[loop] ${loopDecision.action} — ${loopDecision.reason}`)

							if ((loopDecision.action === "continue" || loopDecision.action === "verify") && loopDecision.prompt) {
								if (loopDecision.action === "verify") {
									loopState = enterVerification(loopState)
								}
								loopState = advanceIteration(loopState)

								await client.session.promptAsync({
									path: { id: sessionId },
									body: { parts: [{ type: "text" as const, text: loopDecision.prompt }] },
								}).catch((err: unknown) => {
									log("warn", `[loop] promptAsync failed: ${err}`)
								})
							} else if (loopDecision.action === "stop") {
								loopState = stopLoop(loopState)
								log("info", `[loop] Loop stopped: ${loopDecision.reason}`)
							}
						} catch (err) {
							log("warn", `[loop] Evaluation failed: ${err}`)
						}
					}
					// ── Priority 2: Passive continuation evaluation ──
					else if (continuationConfig.features.continuation) {
						try {
							const [todoRes, messagesRes] = await Promise.all([
								client.session.todo({ path: { id: sessionId } }).catch(() => ({ data: [] as Todo[] })),
								client.session.messages({ path: { id: sessionId } }).catch(() => ({ data: [] as any[] })),
							])

							const todos = (todoRes.data ?? []) as Todo[]
							const messages = (messagesRes.data ?? []) as any[]
							const { text, hadToolCalls } = extractLastAssistantMessage(messages)

							const decision = evaluate(
								continuationConfig,
								continuationState,
								text,
								hadToolCalls,
								todos,
							)

							log("info", `[continuation] Decision: ${decision.action} — ${decision.reason}`)

							if (decision.action === "continue" && decision.prompt) {
								continuationState.consecutiveContinuations++
								continuationState.totalSessionContinuations++
								continuationState.lastContinuationAt = Date.now()

								log("info", `[continuation] Sending continuation prompt (consecutive: ${continuationState.consecutiveContinuations}, total: ${continuationState.totalSessionContinuations})`)

								await client.session.promptAsync({
									path: { id: sessionId },
									body: { parts: [{ type: "text" as const, text: decision.prompt }] },
								}).catch((err: unknown) => {
									log("warn", `[continuation] promptAsync failed: ${err}`)
								})
							}
						} catch (err) {
							log("warn", `[continuation] Evaluation failed: ${err}`)
						}
					}
				}
			} catch (err) {
				log("warn", `[continuation] event hook failed: ${err}`)
			}
		},
	}
}

export default KortixContinuationPlugin
