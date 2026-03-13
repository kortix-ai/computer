/**
 * Autowork Loop — State machine for autonomous work continuation
 *
 * Single unified autowork mode: always self-verifies, 500 max iterations.
 * State is persisted to .kortix/loop-state.json for crash recovery.
 *
 * Robustness features:
 *   - Exponential backoff: baseCooldown * 2^min(failures, 5)
 *   - 5-minute hard pause after 5 consecutive failures (auto-resets)
 *   - Scan ALL assistant messages since loop start for promise detection
 *     (not just the last message — can't miss a promise buried in history)
 *   - Abort grace period: skip continuation for 3s after abort events
 *   - Internal marker on all injected prompts prevents keyword re-triggering
 *
 * Decision flow on session.idle:
 *   1. Not active → stop
 *   2. Stopped flag → skip (re-enabled on next user message)
 *   3. Abort grace period → skip
 *   4. Exponential backoff cooldown → skip
 *   5. Max consecutive failures → skip until reset window
 *   6. Max iterations → force stop
 *   7. DONE + VERIFIED found in message history → stop (complete)
 *   8. DONE found (not yet verified) → enter verification
 *   9. In verification, no VERIFIED → continue (fix issues)
 *  10. Default → continue working
 */

import type { LoopState } from "./config"
import { AUTOWORK_LOOP_CONFIG, INTERNAL_MARKER, createInitialLoopState } from "./config"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { evaluateTodos, formatRemainingWork } from "./todo-enforcer"
import type { Todo } from "@opencode-ai/sdk"

// ─── Constants ────────────────────────────────────────────────────────────────

const KORTIX_DIR = process.env.KORTIX_DIR || join(process.cwd(), ".kortix")
const LOOP_STATE_PATH = `${KORTIX_DIR}/loop-state.json`

// ─── Persistence ─────────────────────────────────────────────────────────────

/** Write loop state to disk for crash recovery */
export function persistLoopState(state: LoopState): void {
	try {
		if (!existsSync(KORTIX_DIR)) mkdirSync(KORTIX_DIR, { recursive: true })
		writeFileSync(LOOP_STATE_PATH, JSON.stringify(state, null, 2), "utf-8")
	} catch {
		/* non-fatal — in-memory state is authoritative */
	}
}

/** Read persisted loop state from disk (returns null if none or invalid) */
export function loadPersistedLoopState(): LoopState | null {
	try {
		if (!existsSync(LOOP_STATE_PATH)) return null
		const raw = readFileSync(LOOP_STATE_PATH, "utf-8")
		const parsed = JSON.parse(raw) as LoopState
		if (typeof parsed.active !== "boolean") return null
		return parsed
	} catch {
		return null
	}
}

// ─── Loop Lifecycle ───────────────────────────────────────────────────────────

/** Activate a new autowork loop */
export function startLoop(
	taskPrompt: string,
	sessionId: string,
	messageCountAtStart: number = 0,
): LoopState {
	const state: LoopState = {
		...createInitialLoopState(),
		active: true,
		taskPrompt,
		sessionId,
		startedAt: Date.now(),
		messageCountAtStart,
	}
	persistLoopState(state)
	return state
}

/** Deactivate the loop */
export function stopLoop(state: LoopState): LoopState {
	const updated: LoopState = { ...state, active: false }
	persistLoopState(updated)
	return updated
}

/** Mark the loop as explicitly stopped by user (/autowork-stop) */
export function markStopped(state: LoopState): LoopState {
	const updated: LoopState = { ...state, stopped: true }
	persistLoopState(updated)
	return updated
}

/** Clear the stopped flag (called when user sends a new message) */
export function clearStopped(state: LoopState): LoopState {
	const updated: LoopState = { ...state, stopped: false }
	persistLoopState(updated)
	return updated
}

/** Record an abort event timestamp */
export function recordAbort(state: LoopState): LoopState {
	const updated: LoopState = { ...state, lastAbortAt: Date.now() }
	persistLoopState(updated)
	return updated
}

/** Increment iteration counter and record successful injection */
export function advanceIteration(state: LoopState): LoopState {
	const updated: LoopState = {
		...state,
		iteration: state.iteration + 1,
		lastInjectedAt: Date.now(),
		consecutiveFailures: 0,  // reset on success
	}
	persistLoopState(updated)
	return updated
}

/** Record an injection failure (for exponential backoff) */
export function recordFailure(state: LoopState): LoopState {
	const updated: LoopState = {
		...state,
		consecutiveFailures: state.consecutiveFailures + 1,
		lastFailureAt: Date.now(),
	}
	persistLoopState(updated)
	return updated
}

/** Enter the self-verification phase */
export function enterVerification(state: LoopState): LoopState {
	const updated: LoopState = { ...state, inVerification: true }
	persistLoopState(updated)
	return updated
}

/** Exit verification phase (back to work) */
export function exitVerification(state: LoopState): LoopState {
	const updated: LoopState = { ...state, inVerification: false }
	persistLoopState(updated)
	return updated
}

// ─── Safety Checks ────────────────────────────────────────────────────────────

/**
 * Check if continuation should be skipped due to safety constraints.
 * Returns a reason string if should skip, null if safe to proceed.
 */
export function checkLoopSafetyGates(
	state: LoopState,
	abortGracePeriodMs: number,
	maxConsecutiveFailures: number,
	failureResetWindowMs: number,
	baseCooldownMs: number,
): string | null {
	// Explicitly stopped — wait for user's next message to re-enable
	if (state.stopped) {
		return "continuation stopped by user — waiting for next message"
	}

	// Abort grace period
	if (state.lastAbortAt > 0) {
		const timeSinceAbort = Date.now() - state.lastAbortAt
		if (timeSinceAbort < abortGracePeriodMs) {
			return `abort grace period: ${Math.round((abortGracePeriodMs - timeSinceAbort) / 1000)}s remaining`
		}
	}

	// Auto-reset failure count after recovery window
	if (state.consecutiveFailures >= maxConsecutiveFailures) {
		if (state.lastFailureAt > 0 && Date.now() - state.lastFailureAt >= failureResetWindowMs) {
			// Will be reset by caller — signal that reset is needed
			return "__reset_failures__"
		}
		return `max consecutive failures (${state.consecutiveFailures}) — pausing for ${Math.round(failureResetWindowMs / 60000)} min`
	}

	// Exponential backoff on failures: baseCooldown * 2^min(failures, 5)
	if (state.lastInjectedAt > 0 && state.consecutiveFailures > 0) {
		const effectiveCooldown = baseCooldownMs * Math.pow(2, Math.min(state.consecutiveFailures, 5))
		const elapsed = Date.now() - state.lastInjectedAt
		if (elapsed < effectiveCooldown) {
			return `backoff cooldown: ${Math.round((effectiveCooldown - elapsed) / 1000)}s remaining (failure ${state.consecutiveFailures})`
		}
	}

	// Minimum spacing between injections even in happy path (prevents spam on rapid idle events)
	if (state.lastInjectedAt > 0 && state.consecutiveFailures === 0) {
		const elapsed = Date.now() - state.lastInjectedAt
		if (elapsed < baseCooldownMs) {
			return `minimum cooldown: ${Math.round((baseCooldownMs - elapsed) / 1000)}s remaining`
		}
	}

	return null
}

// ─── Loop Evaluation ──────────────────────────────────────────────────────────

export type LoopAction = "continue" | "verify" | "stop"

export interface LoopDecision {
	action: LoopAction
	prompt: string | null
	reason: string
}

/**
 * Evaluate whether the loop should continue, enter verification, or stop.
 *
 * @param state - Current loop state
 * @param allAssistantTexts - ALL assistant message texts since loop start
 *                            (not just the last one — critical for promise detection)
 * @param todos - Current todo list from the session (optional — for enforcement)
 */
export function evaluateLoop(
	state: LoopState,
	allAssistantTexts: string[],
	todos?: Todo[],
): LoopDecision {
	if (!state.active) {
		return { action: "stop", prompt: null, reason: "no active loop" }
	}

	const config = AUTOWORK_LOOP_CONFIG

	// Hard limit: max iterations
	if (state.iteration >= config.maxIterations) {
		return {
			action: "stop",
			prompt: null,
			reason: `max iterations reached (${config.maxIterations})`,
		}
	}

	// Scan ALL messages since loop start for promises
	// This is critical — a promise could be buried in an earlier message
	const combinedText = allAssistantTexts.join("\n")
	const hasCompletionPromise = combinedText.includes(config.completionPromise)
	const hasVerificationPromise = combinedText.includes(config.verificationPromise)

	// Both promises found → fully done
	if (hasCompletionPromise && hasVerificationPromise) {
		return {
			action: "stop",
			prompt: null,
			reason: "both DONE and VERIFIED promises detected — loop complete",
		}
	}

	// DONE found — but first check: do todos say otherwise?
	if (hasCompletionPromise && !state.inVerification) {
		// If we have a todo list and it has unfinished items, override DONE — agent claimed done too early
		if (todos && todos.length > 0) {
			const todoResult = evaluateTodos(todos)
			if (todoResult.verdict === "unfinished") {
				// Agent said DONE but todos disagree — nudge to finish remaining work
				return {
					action: "continue",
					prompt: buildPrematureDonePrompt(state, todoResult),
					reason: `DONE claimed but ${todoResult.reason} — continuing`,
				}
			}
		}
		// Todos are done (or no todos) — enter verification
		return {
			action: "verify",
			prompt: buildVerificationPrompt(state, todos),
			reason: "DONE promise detected — entering self-verification",
		}
	}

	// In verification phase: check if verified
	if (state.inVerification) {
		if (hasVerificationPromise) {
			return {
				action: "stop",
				prompt: null,
				reason: "VERIFIED promise detected — loop complete",
			}
		}
		// DONE was emitted again during verification (issues found + fixed)
		if (hasCompletionPromise) {
			// Re-check todos before re-entering verification
			if (todos && todos.length > 0) {
				const todoResult = evaluateTodos(todos)
				if (todoResult.verdict === "unfinished") {
					return {
						action: "continue",
						prompt: buildPrematureDonePrompt(state, todoResult),
						reason: `DONE re-emitted but todos still unfinished — continuing`,
					}
				}
			}
			return {
				action: "verify",
				prompt: buildVerificationPrompt(state, todos),
				reason: "DONE re-emitted during verification — re-verifying",
			}
		}
		// Still in verification, no promises — continue fixing
		return {
			action: "continue",
			prompt: buildVerificationContinuationPrompt(state),
			reason: "in verification phase — no promises yet, continue fixing",
		}
	}

	// Default: keep working
	return {
		action: "continue",
		prompt: buildLoopContinuationPrompt(state, todos),
		reason: `iteration ${state.iteration + 1}/${config.maxIterations}`,
	}
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildLoopContinuationPrompt(state: LoopState, todos?: Todo[]): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK]`)
	parts.push(`You are in an active autowork loop. Iteration: ${state.iteration + 1} of ${config.maxIterations}.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	// Inject live todo state if available
	if (todos && todos.length > 0) {
		const todoResult = evaluateTodos(todos)
		if (todoResult.verdict === "unfinished" && todoResult.remainingItems.length > 0) {
			parts.push(formatRemainingWork(todoResult))
			parts.push("")
		} else if (todoResult.verdict === "done") {
			parts.push(`[TODO STATUS] All ${todoResult.totalItems} items complete.`)
			parts.push("")
		}
	}

	parts.push(`Continue working on the next pending item.`)
	parts.push(`When ALL todos are done and work is verified, emit exactly:`)
	parts.push(config.completionPromise)
	parts.push(``)
	parts.push(`Do NOT emit this promise while any todo item is still pending or in-progress.`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}

function buildPrematureDonePrompt(state: LoopState, todoResult: ReturnType<typeof evaluateTodos>): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK: PREMATURE DONE DETECTED]`)
	parts.push(`You emitted <promise>DONE</promise> but your todo list shows unfinished work.`)
	parts.push(`Do NOT emit DONE until every todo item is completed or cancelled.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	parts.push(formatRemainingWork(todoResult))
	parts.push("")
	parts.push(`Complete the remaining items above, then emit ${config.completionPromise}.`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}

function buildVerificationPrompt(state: LoopState, todos?: Todo[]): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK VERIFICATION]`)
	parts.push(`You claimed completion. Now you MUST verify your work before the loop ends.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	if (todos && todos.length > 0) {
		const todoResult = evaluateTodos(todos)
		if (todoResult.completedItems > 0) {
			parts.push(`[TODO STATUS] ${todoResult.completedItems}/${todoResult.totalItems} items completed.`)
			parts.push("")
		}
	}

	parts.push(`Verification checklist (non-negotiable):`)
	parts.push(`1. Re-read every changed file — confirm correctness and no typos`)
	parts.push(`2. Run tests, builds, and linters — confirm they all pass`)
	parts.push(`3. Check every requirement from the original task — confirm each is fully met`)
	parts.push(`4. Check for regressions — confirm nothing that previously worked is now broken`)
	parts.push("")
	parts.push(`If ALL checks pass, emit exactly:`)
	parts.push(config.verificationPromise)
	parts.push("")
	parts.push(`If ANY check fails, fix the issues, then emit:`)
	parts.push(config.completionPromise)
	parts.push("")
	parts.push(`Do NOT emit VERIFIED until you have actually run the checks above.`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}

function buildVerificationContinuationPrompt(state: LoopState): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK VERIFICATION CONTINUATION]`)
	parts.push(`You are in the verification phase. Continue verifying your work.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	parts.push(`Run all remaining verification checks. Fix any issues found.`)
	parts.push("")
	parts.push(`When verification passes: emit ${config.verificationPromise}`)
	parts.push(`When issues are found and fixed: emit ${config.completionPromise} to re-enter verification`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}
