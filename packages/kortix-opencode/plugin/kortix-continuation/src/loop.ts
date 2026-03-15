/**
 * Autowork Loop — State machine for autonomous work continuation
 *
 * Supports concurrent sessions: each session's state is persisted independently
 * to .kortix/loop-states/{sessionId}.json. Always self-verifies, 500 max iterations.
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
 *
 * E2E Verification mandate:
 *   VERIFIED is only valid after the agent has provably tested the work
 *   end-to-end: curl/HTTP requests, browser automation, CLI smoke tests,
 *   or equivalent human-like validation that the thing actually WORKS.
 *   "Re-reading files" and "running unit tests" alone are NOT sufficient.
 */

import type { LoopState } from "./config"
import { AUTOWORK_LOOP_CONFIG, INTERNAL_MARKER, createInitialLoopState } from "./config"
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { evaluateTodos, formatRemainingWork } from "./todo-enforcer"
import type { Todo } from "@opencode-ai/sdk"

// ─── Constants ────────────────────────────────────────────────────────────────

const KORTIX_DIR = process.env.KORTIX_DIR || join(process.cwd(), ".kortix")
const LOOP_STATE_DIR = `${KORTIX_DIR}/loop-states`
/** @deprecated kept for migration from single-file to per-session persistence */
const LEGACY_LOOP_STATE_PATH = `${KORTIX_DIR}/loop-state.json`

// ─── Persistence ─────────────────────────────────────────────────────────────

/** Get the per-session state file path */
function loopStatePath(sessionId: string): string {
	return join(LOOP_STATE_DIR, `${sessionId}.json`)
}

/** Write loop state to disk for crash recovery (per-session) */
export function persistLoopState(state: LoopState): void {
	try {
		if (!state.sessionId) return
		if (!existsSync(LOOP_STATE_DIR)) mkdirSync(LOOP_STATE_DIR, { recursive: true })
		writeFileSync(loopStatePath(state.sessionId), JSON.stringify(state, null, 2), "utf-8")
	} catch {
		/* non-fatal — in-memory state is authoritative */
	}
}

/** Read persisted loop state from disk for a specific session */
export function loadPersistedLoopState(sessionId?: string): LoopState | null {
	try {
		// If sessionId provided, load from per-session file
		if (sessionId) {
			const path = loopStatePath(sessionId)
			if (existsSync(path)) {
				const raw = readFileSync(path, "utf-8")
				const parsed = JSON.parse(raw) as LoopState
				if (typeof parsed.active === "boolean") return parsed
			}
		}
		// Fallback: try legacy single-file (migration path)
		if (existsSync(LEGACY_LOOP_STATE_PATH)) {
			const raw = readFileSync(LEGACY_LOOP_STATE_PATH, "utf-8")
			const parsed = JSON.parse(raw) as LoopState
			if (typeof parsed.active !== "boolean") return null
			// Migrate: write to per-session file and delete legacy
			if (parsed.sessionId) {
				persistLoopState(parsed)
				try { unlinkSync(LEGACY_LOOP_STATE_PATH) } catch { /* non-fatal */ }
			}
			return parsed
		}
		return null
	} catch {
		return null
	}
}

/** Load all persisted loop states from disk (for startup recovery) */
export function loadAllPersistedLoopStates(): Map<string, LoopState> {
	const states = new Map<string, LoopState>()
	try {
		if (!existsSync(LOOP_STATE_DIR)) return states
		const files = readdirSync(LOOP_STATE_DIR).filter(f => f.endsWith(".json"))
		for (const file of files) {
			try {
				const raw = readFileSync(join(LOOP_STATE_DIR, file), "utf-8")
				const parsed = JSON.parse(raw) as LoopState
				if (typeof parsed.active === "boolean" && parsed.sessionId) {
					states.set(parsed.sessionId, parsed)
				}
			} catch { /* skip invalid files */ }
		}
	} catch { /* non-fatal */ }
	// Also check legacy single-file
	try {
		if (existsSync(LEGACY_LOOP_STATE_PATH)) {
			const raw = readFileSync(LEGACY_LOOP_STATE_PATH, "utf-8")
			const parsed = JSON.parse(raw) as LoopState
			if (typeof parsed.active === "boolean" && parsed.sessionId && !states.has(parsed.sessionId)) {
				states.set(parsed.sessionId, parsed)
				// Migrate
				persistLoopState(parsed)
				try { unlinkSync(LEGACY_LOOP_STATE_PATH) } catch { /* non-fatal */ }
			}
		}
	} catch { /* non-fatal */ }
	return states
}

/** Remove persisted loop state for a session (cleanup after loop ends) */
export function removePersistedLoopState(sessionId: string): void {
	try {
		const path = loopStatePath(sessionId)
		if (existsSync(path)) unlinkSync(path)
	} catch { /* non-fatal */ }
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

/**
 * Mark the loop as permanently stopped by user (/autowork-stop).
 * This is PERMANENT within the session — new user messages do NOT clear it.
 * The only way to re-enable is a fresh /autowork command.
 */
export function markStopped(state: LoopState): LoopState {
	const updated: LoopState = { ...state, stopped: true }
	persistLoopState(updated)
	return updated
}

/**
 * Clear the stopped flag.
 * NOTE: This is NOT called automatically on new user messages anymore.
 * It is only used if explicitly re-activating via /autowork.
 * A new /autowork call goes through startLoop() which resets all state anyway.
 */
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
	// Explicitly stopped by /autowork-stop — permanent until /autowork restarts
	if (state.stopped) {
		return "continuation stopped by user (/autowork-stop) — use /autowork to restart"
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
			reason: "DONE promise detected — entering E2E verification",
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
				reason: "DONE re-emitted during verification — re-verifying E2E",
			}
		}
		// Still in verification, no promises — continue fixing
		return {
			action: "continue",
			prompt: buildVerificationContinuationPrompt(state),
			reason: "in E2E verification phase — no promises yet, continue fixing",
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
	parts.push(`As you complete each step: verify it worked before moving to the next.`)
	parts.push(`Don't batch verification at the end — confirm each piece of output as you produce it.`)
	parts.push(`When ALL todos are done and every step has been verified, emit exactly:`)
	parts.push(config.completionPromise)
	parts.push(``)
	parts.push(`Do NOT emit this promise while any todo item is still pending or in-progress.`)
	parts.push(`Do NOT emit this promise based on intent — only on observed, confirmed results.`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}

function buildPrematureDonePrompt(state: LoopState, todoResult: ReturnType<typeof evaluateTodos>): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK: PREMATURE DONE DETECTED]`)
	parts.push(`You emitted <promise>DONE</promise> but your todo list shows unfinished work.`)
	parts.push(`Do NOT emit DONE until every todo item is completed or cancelled AND you have E2E-verified the result.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	parts.push(formatRemainingWork(todoResult))
	parts.push("")
	parts.push(`Complete the remaining items above, verify end-to-end, then emit ${config.completionPromise}.`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}

function buildVerificationPrompt(state: LoopState, todos?: Todo[]): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK VERIFICATION]`)
	parts.push(`You claimed completion. Before the loop ends you MUST verify — not assume — that your work is correct.`)
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

	parts.push(`Verification is step-by-step, not a final sweep. For every step you complete:`)
	parts.push(`  → Run it / call it / open it / observe it`)
	parts.push(`  → Confirm the output is what you expected`)
	parts.push(`  → Only then move to the next step`)
	parts.push("")
	parts.push(`Then verify the whole end-to-end:`)
	parts.push("")
	parts.push(`1. Every artifact must be confirmed working, not just written.`)
	parts.push(`   Code runs. Things respond. Output is correct. Prove it — don't assume it.`)
	parts.push("")
	parts.push(`2. Exercise the actual output, not the source.`)
	parts.push(`   Re-reading files is not verification. Run it, observe real output — logs,`)
	parts.push(`   responses, return values, rendered state — and confirm they are correct.`)
	parts.push("")
	parts.push(`3. Trace the full flow from start to finish.`)
	parts.push(`   Each piece working in isolation is not enough. Walk the complete path`)
	parts.push(`   a real caller or user would take and confirm every step holds together.`)
	parts.push("")
	parts.push(`4. Check for regressions.`)
	parts.push(`   Anything that worked before your changes must still work.`)
	parts.push(`   Don't only test what you added — test what you might have broken.`)
	parts.push("")
	parts.push(`5. Confirm every requirement is met.`)
	parts.push(`   Go back to the original task. Each stated requirement must be demonstrably`)
	parts.push(`   satisfied — not inferred, not partially done, actually done.`)
	parts.push("")
	parts.push(`If ALL checks pass: emit exactly:`)
	parts.push(config.verificationPromise)
	parts.push("")
	parts.push(`If ANY check fails: fix the issues, then emit:`)
	parts.push(config.completionPromise)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}

function buildVerificationContinuationPrompt(state: LoopState): string {
	const config = AUTOWORK_LOOP_CONFIG
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - AUTOWORK VERIFICATION CONTINUATION]`)
	parts.push(`You are in the verification phase. Keep going until everything is confirmed working.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	parts.push(`Verify step by step — run each piece, observe real output, confirm it's correct.`)
	parts.push(`Don't move on until the current step is confirmed. Seeing it work is the bar.`)
	parts.push("")
	parts.push(`Fix every failure you find. When all steps pass and the full flow works end-to-end:`)
	parts.push(`  → emit ${config.verificationPromise}`)
	parts.push("")
	parts.push(`If you found and fixed issues, re-enter the verification cycle:`)
	parts.push(`  → emit ${config.completionPromise}`)
	parts.push(INTERNAL_MARKER)

	return parts.join("\n")
}
