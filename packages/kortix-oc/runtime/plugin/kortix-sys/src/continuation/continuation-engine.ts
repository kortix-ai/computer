/**
 * Continuation Engine — Core session.idle evaluator
 *
 * Combines signals from IntentGate, TodoEnforcer, and safety limits
 * to decide whether to inject a continuation prompt when session goes idle.
 *
 * This is the single entry point called from the plugin's session.idle hook.
 * It does NOT call promptAsync itself — it returns a decision that the
 * plugin hook acts on.
 */

import type { Todo } from "@opencode-ai/sdk"
import type { ContinuationConfig, ContinuationState } from "./config"
import { classifyIntent, type IntentResult } from "./intent-gate"
import { evaluateTodos, formatRemainingWork, type TodoEnforcerResult } from "./todo-enforcer"

// ─── Decision Types ──────────────────────────────────────────────────────────

export type ContinuationAction = "continue" | "stop"

export interface ContinuationDecision {
	action: ContinuationAction
	/** The prompt to inject if action === "continue" */
	prompt: string | null
	/** Human-readable reason for the decision (logged, not sent to model) */
	reason: string
	/** Signal sources that informed the decision */
	signals: {
		intent?: IntentResult
		todo?: TodoEnforcerResult
		safetyCheck?: string
	}
}

// ─── Safety Checks ───────────────────────────────────────────────────────────

function checkSafetyLimits(
	config: ContinuationConfig,
	state: ContinuationState,
): string | null {
	const now = Date.now()

	// Cooldown check
	if (now - state.lastContinuationAt < config.thresholds.cooldownMs) {
		return `cooldown: ${config.thresholds.cooldownMs}ms not elapsed`
	}

	// Consecutive continuation limit
	if (state.consecutiveContinuations >= config.thresholds.maxContinuations) {
		return `max consecutive continuations reached (${config.thresholds.maxContinuations})`
	}

	// Session-wide limit
	if (state.totalSessionContinuations >= config.thresholds.maxSessionContinuations) {
		return `max session continuations reached (${config.thresholds.maxSessionContinuations})`
	}

	// Min work duration (don't continue if agent barely started)
	if (state.workCycleStartedAt > 0 && now - state.workCycleStartedAt < config.thresholds.minWorkDurationMs) {
		return `min work duration not met (${config.thresholds.minWorkDurationMs}ms)`
	}

	return null
}

// ─── Continuation Prompt Builder ─────────────────────────────────────────────

function buildContinuationPrompt(
	intent: IntentResult,
	todoResult: TodoEnforcerResult | null,
	state: ContinuationState,
): string {
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - TODO CONTINUATION]`)
	parts.push(`You have unfinished work. Continue from where you left off.`)
	parts.push(`Continuation #${state.consecutiveContinuations + 1} of max ${state.consecutiveContinuations + 5}.`)

	if (todoResult && todoResult.remainingItems.length > 0) {
		parts.push("")
		parts.push(formatRemainingWork(todoResult))
	}

	parts.push("")
	parts.push(`Pick up the next pending/in-progress item and continue working. Do not re-explain what was already done.`)

	return parts.join("\n")
}

// ─── Main Evaluator ──────────────────────────────────────────────────────────

/**
 * Evaluate whether a session should continue after going idle.
 *
 * Call flow:
 *   1. Safety limits → stop if exceeded
 *   2. IntentGate → classify last assistant message
 *   3. TodoEnforcer → check for unfinished tracked work
 *   4. Combine signals → decide
 */
export function evaluate(
	config: ContinuationConfig,
	state: ContinuationState,
	lastAssistantText: string,
	hadToolCalls: boolean,
	todos: Todo[],
): ContinuationDecision {
	// Feature check
	if (!config.features.continuation) {
		return { action: "stop", prompt: null, reason: "continuation disabled", signals: {} }
	}

	// Safety limits
	const safetyViolation = checkSafetyLimits(config, state)
	if (safetyViolation) {
		return {
			action: "stop",
			prompt: null,
			reason: `safety: ${safetyViolation}`,
			signals: { safetyCheck: safetyViolation },
		}
	}

	// IntentGate classification
	let intentResult: IntentResult | undefined
	if (config.features.intentGate) {
		intentResult = classifyIntent(lastAssistantText, hadToolCalls, todos)

		// Hard stops from intent classification
		if (intentResult.intent === "completed") {
			return { action: "stop", prompt: null, reason: "intent: completed", signals: { intent: intentResult } }
		}
		if (intentResult.intent === "blocked-human") {
			return { action: "stop", prompt: null, reason: "intent: blocked on user", signals: { intent: intentResult } }
		}
		if (intentResult.intent === "blocked-external") {
			return { action: "stop", prompt: null, reason: "intent: blocked on external", signals: { intent: intentResult } }
		}
		if (intentResult.intent === "answer") {
			return { action: "stop", prompt: null, reason: "intent: answer-only", signals: { intent: intentResult } }
		}
	}

	// TodoEnforcer — the primary signal for continuation
	let todoResult: TodoEnforcerResult | undefined
	if (config.features.todoEnforcer) {
		todoResult = evaluateTodos(todos)

		if (todoResult.verdict === "done") {
			return {
				action: "stop",
				prompt: null,
				reason: `todos: ${todoResult.reason}`,
				signals: { intent: intentResult, todo: todoResult },
			}
		}

		if (todoResult.verdict === "blocked") {
			return {
				action: "stop",
				prompt: null,
				reason: `todos: ${todoResult.reason}`,
				signals: { intent: intentResult, todo: todoResult },
			}
		}

		// Unfinished work → continue
		if (todoResult.verdict === "unfinished") {
			const prompt = buildContinuationPrompt(
				intentResult ?? { intent: "unknown", reason: "gate disabled", shouldContinue: true },
				todoResult,
				state,
			)
			return {
				action: "continue",
				prompt,
				reason: `todos: ${todoResult.reason}`,
				signals: { intent: intentResult, todo: todoResult },
			}
		}
	}

	// Intent-only mode (no todo enforcer): rely on intent classification
	if (intentResult?.shouldContinue) {
		const prompt = buildContinuationPrompt(
			intentResult,
			todoResult ?? null,
			state,
		)
		return {
			action: "continue",
			prompt,
			reason: `intent: ${intentResult.reason}`,
			signals: { intent: intentResult },
		}
	}

	// Default: stop (conservative)
	return {
		action: "stop",
		prompt: null,
		reason: "no continuation signals",
		signals: { intent: intentResult, todo: todoResult },
	}
}
