/**
 * Intent Gate — Lightweight turn classifier
 *
 * Classifies the last assistant message to determine whether continuation
 * is appropriate. Keeps the engine from looping on conversational turns,
 * user-blocked states, or answer-only responses.
 *
 * Classification is heuristic-based (no LLM call). The goal is to catch
 * obvious stop-cases cheaply before the engine consults todo state.
 */

import type { Todo } from "@opencode-ai/sdk"

// ─── Intent Types ────────────────────────────────────────────────────────────

export type Intent =
	| "answer"              // Simple Q&A — no continuation needed
	| "executing"           // Actively working on a task (tool calls present)
	| "planning"            // Laid out a plan, may need to execute
	| "blocked-human"       // Waiting on the user for input/decision/credentials
	| "blocked-external"    // Waiting on external dependency (OAuth, API key, etc.)
	| "completed"           // Explicitly signaled completion
	| "unknown"             // Can't classify — fall through to other signals

export interface IntentResult {
	intent: Intent
	reason: string
	shouldContinue: boolean
}

// ─── Classification ──────────────────────────────────────────────────────────

// Patterns that indicate the assistant is waiting on the user
const BLOCKED_HUMAN_PATTERNS = [
	/(?:should i|shall i|would you like|do you want|let me know|please confirm|waiting for your)/i,
	/(?:which (?:option|approach|one)|what do you (?:think|prefer))/i,
	/(?:before i proceed|proceed with|go ahead with)/i,
	/(?:could you (?:provide|share|clarify|specify))/i,
	/(?:i need you to|please (?:provide|share|specify|tell me))/i,
]

// Patterns that indicate external blockers
const BLOCKED_EXTERNAL_PATTERNS = [
	/(?:api key|api_key|token|credential|secret|password).*(?:not set|missing|required|needed|unavailable)/i,
	/(?:oauth|authorization|authenticate).*(?:required|needed|first)/i,
	/(?:connect|configure|set up).*(?:first|before)/i,
]

// Patterns that indicate explicit completion
const COMPLETION_PATTERNS = [
	/(?:^|\n)(?:all (?:tasks?|items?|todos?) (?:are )?(?:completed?|done|finished))/i,
	/(?:everything (?:is )?(?:done|complete|finished))/i,
	/(?:task (?:is )?(?:complete|done|finished))/i,
	/(?:successfully (?:completed?|implemented|deployed|shipped))/i,
	/(?:^|\n)done[.!]?\s*$/im,
]

// Patterns that indicate answer-only (no action taken)
const ANSWER_ONLY_PATTERNS = [
	/(?:^here'?s? (?:the|an|a) (?:explanation|answer|summary))/i,
	/(?:^in (?:short|summary|brief))/i,
	/(?:^to answer your question)/i,
	/(?:^the (?:answer|reason|explanation) is)/i,
]

// Patterns indicating a plan was laid out
const PLANNING_PATTERNS = [
	/(?:here'?s? (?:the|my|a) plan)/i,
	/(?:i'?ll|i will|let me) (?:start|begin) (?:by|with)/i,
	/(?:step \d|phase \d|first,? i'?ll)/i,
	/(?:the approach|my approach|implementation plan)/i,
]

/**
 * Classify the last assistant message to determine if continuation is appropriate.
 *
 * @param lastAssistantText - The text content of the last assistant message
 * @param hadToolCalls - Whether the assistant's last turn included tool calls
 * @param todos - Current todo state (if available)
 */
export function classifyIntent(
	lastAssistantText: string,
	hadToolCalls: boolean,
	todos?: Todo[],
): IntentResult {
	const text = lastAssistantText.trim()

	// Empty response — likely still processing or error
	if (!text && !hadToolCalls) {
		return { intent: "unknown", reason: "empty response", shouldContinue: false }
	}

	// 1. Check for explicit completion signals
	for (const pattern of COMPLETION_PATTERNS) {
		if (pattern.test(text)) {
			return { intent: "completed", reason: "explicit completion signal", shouldContinue: false }
		}
	}

	// 2. Check for external blockers (higher priority than human-blocked)
	for (const pattern of BLOCKED_EXTERNAL_PATTERNS) {
		if (pattern.test(text)) {
			return { intent: "blocked-external", reason: "waiting on external dependency", shouldContinue: false }
		}
	}

	// 3. Check for human-blocked state
	for (const pattern of BLOCKED_HUMAN_PATTERNS) {
		if (pattern.test(text)) {
			return { intent: "blocked-human", reason: "waiting on user input", shouldContinue: false }
		}
	}

	// 4. If the turn had tool calls, the agent was actively working
	if (hadToolCalls) {
		return { intent: "executing", reason: "tool calls present", shouldContinue: true }
	}

	// 5. Check if this looks like a plan (planning → might need to continue to execute)
	for (const pattern of PLANNING_PATTERNS) {
		if (pattern.test(text)) {
			// Only continue if there are pending todos
			const hasPendingWork = todos?.some(t => t.status === "pending" || t.status === "in_progress")
			return {
				intent: "planning",
				reason: hasPendingWork ? "plan with pending work" : "plan laid out",
				shouldContinue: hasPendingWork ?? false,
			}
		}
	}

	// 6. Check for answer-only patterns
	for (const pattern of ANSWER_ONLY_PATTERNS) {
		if (pattern.test(text)) {
			return { intent: "answer", reason: "answer-only response", shouldContinue: false }
		}
	}

	// 7. Short text without tool calls — likely conversational
	if (text.length < 200 && !hadToolCalls) {
		return { intent: "answer", reason: "short response without tools", shouldContinue: false }
	}

	// 8. Fall through — can't classify, let other signals decide
	return { intent: "unknown", reason: "unclassified", shouldContinue: false }
}
