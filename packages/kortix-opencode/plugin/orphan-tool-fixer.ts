/**
 * Orphan Tool-Call Fixer Plugin
 *
 * Automatically repairs orphaned tool_use blocks that lack a corresponding
 * tool_result in the next message. This happens when a tool execution is
 * aborted mid-flight (e.g. user cancellation, timeout, crash) and the
 * session is resumed — the Anthropic API rejects the conversation because
 * every tool_use must have a matching tool_result.
 *
 * Strategy: In the `experimental.chat.messages.transform` hook (runs before
 * every LLM call), scan the message array for assistant messages containing
 * aborted tool parts. For each one, inject a synthetic tool_result part
 * with "Tool execution aborted" so the conversation remains coherent for
 * the LLM rather than silently dropping the call.
 *
 * This is a pure in-memory transform — the database is never modified.
 */

import type { Plugin } from "@opencode-ai/plugin"

// ── Types matching the transform hook's message shape ────────────────────────

interface ChatMessagePart {
	type?: string
	callID?: string
	tool?: string
	state?: { status?: string; error?: string; input?: Record<string, unknown>; output?: string }
	text?: string
	[key: string]: unknown
}

interface ChatMessage {
	info?: {
		role?: string
		id?: string
		sessionID?: string
		[key: string]: unknown
	}
	parts?: ChatMessagePart[]
	[key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Known OpenCode abortion error strings (lowercased, trimmed).
 */
const ABORT_ERROR_EXACT: ReadonlySet<string> = new Set([
	"tool execution aborted",
	"aborterror: the operation was aborted.",
	"the user dismissed this question",
])

/**
 * Check if a tool part is an orphaned aborted call:
 * - type is "tool" with a callID
 * - status is "error"
 * - error string exactly matches a known OpenCode abort message
 */
function isAbortedToolPart(part: ChatMessagePart): boolean {
	if (part.type !== "tool" || !part.callID) return false
	const state = part.state
	if (!state) return false
	if (state.status !== "error") return false

	const error = (state.error ?? "").toLowerCase().trim()
	return ABORT_ERROR_EXACT.has(error)
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const OrphanToolFixerPlugin: Plugin = async (_ctx) => {
	return {
		"experimental.chat.messages.transform": async (_input, output) => {
			const messages = output.messages as ChatMessage[]
			if (!messages?.length) return

			let totalFixed = 0

			for (const message of messages) {
				if (message.info?.role !== "assistant") continue
				if (!Array.isArray(message.parts) || message.parts.length === 0) continue

				// For each aborted tool part, patch it to look like a completed
				// tool call with a synthetic "aborted" result so the LLM sees a
				// proper tool_use / tool_result pair.
				for (const part of message.parts) {
					if (!isAbortedToolPart(part)) continue

					part.state = {
						...part.state,
						status: "completed",
						output: "Tool execution aborted — the operation was cancelled before it could complete.",
					}

					totalFixed++
				}
			}

			// Intentionally silent: this repair is expected during resumed sessions and
			// the log line is noisy in normal OpenCode usage.
			// if (totalFixed > 0) {
			// 	console.error(
			// 		`[orphan-tool-fixer] Patched ${totalFixed} aborted tool call(s) with synthetic result`,
			// 	)
			// }
		},
	}
}

export default OrphanToolFixerPlugin
