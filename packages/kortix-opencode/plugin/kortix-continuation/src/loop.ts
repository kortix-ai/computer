/**
 * Loop — Active work loop state machine
 *
 * Manages bounded (work) and verified (ulw) autonomous work loops.
 * State is persisted to /workspace/.kortix/loop-state.json for
 * crash recovery and cross-hook communication.
 *
 * The loop is driven by the session.idle hook: each time the agent
 * goes idle, evaluateLoop() decides whether to inject a continuation
 * prompt, enter verification, or stop the loop.
 */

import type { LoopConfig, LoopState, LoopMode } from "./config"
import { DEFAULT_LOOP_CONFIGS, createInitialLoopState } from "./config"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"

// ─── Constants ───────────────────────────────────────────────────────────────

const KORTIX_DIR = process.env.KORTIX_DIR || join(process.cwd(), ".kortix")
const LOOP_STATE_PATH = `${KORTIX_DIR}/loop-state.json`

// ─── Persistence ─────────────────────────────────────────────────────────────

/** Write loop state to disk for crash recovery and cross-hook reads */
export function persistLoopState(state: LoopState): void {
	try {
		if (!existsSync(KORTIX_DIR)) mkdirSync(KORTIX_DIR, { recursive: true })
		writeFileSync(LOOP_STATE_PATH, JSON.stringify(state, null, 2), "utf-8")
	} catch {
		/* non-fatal — in-memory state is authoritative */
	}
}

/** Read persisted loop state from disk (returns null if none) */
export function loadPersistedLoopState(): LoopState | null {
	try {
		if (!existsSync(LOOP_STATE_PATH)) return null
		const raw = readFileSync(LOOP_STATE_PATH, "utf-8")
		const parsed = JSON.parse(raw) as LoopState
		// Validate required fields
		if (typeof parsed.active !== "boolean") return null
		return parsed
	} catch {
		return null
	}
}

// ─── Loop Lifecycle ──────────────────────────────────────────────────────────

/** Activate a new loop */
export function startLoop(
	mode: LoopMode,
	taskPrompt: string,
	sessionId: string,
): LoopState {
	const state: LoopState = {
		active: true,
		mode,
		taskPrompt,
		iteration: 0,
		sessionId,
		startedAt: Date.now(),
		inVerification: false,
	}
	persistLoopState(state)
	return state
}

/** Deactivate the loop */
export function stopLoop(state: LoopState): LoopState {
	const updated: LoopState = {
		...state,
		active: false,
	}
	persistLoopState(updated)
	return updated
}

/** Increment iteration counter */
export function advanceIteration(state: LoopState): LoopState {
	const updated: LoopState = {
		...state,
		iteration: state.iteration + 1,
	}
	persistLoopState(updated)
	return updated
}

/** Enter the self-verification phase (ULW mode) */
export function enterVerification(state: LoopState): LoopState {
	const updated: LoopState = {
		...state,
		inVerification: true,
	}
	persistLoopState(updated)
	return updated
}

/** Exit verification phase (back to work) */
export function exitVerification(state: LoopState): LoopState {
	const updated: LoopState = {
		...state,
		inVerification: false,
	}
	persistLoopState(updated)
	return updated
}

// ─── Loop Evaluation ─────────────────────────────────────────────────────────

export type LoopAction = "continue" | "verify" | "stop"

export interface LoopDecision {
	action: LoopAction
	prompt: string | null
	reason: string
}

/**
 * Evaluate whether the loop should continue, enter verification, or stop.
 *
 * Decision flow:
 *   1. No active loop → stop
 *   2. Max iterations exceeded → stop
 *   3. Completion promise detected →
 *      a. ULW + not yet verified → enter verification
 *      b. Otherwise → stop (done)
 *   4. In verification phase + verification promise detected → stop (verified)
 *   5. In verification phase + no promise → continue (fix issues)
 *   6. Default → continue working
 */
export function evaluateLoop(
	state: LoopState,
	lastAssistantText: string,
): LoopDecision {
	if (!state.active || !state.mode) {
		return { action: "stop", prompt: null, reason: "no active loop" }
	}

	const config = DEFAULT_LOOP_CONFIGS[state.mode]

	// Hard limit: max iterations
	if (state.iteration >= config.maxIterations) {
		return {
			action: "stop",
			prompt: null,
			reason: `max iterations reached (${config.maxIterations})`,
		}
	}

	// Check for completion promise in agent's last message
	if (lastAssistantText.includes(config.completionPromise)) {
		// ULW mode: completion → mandatory self-verification
		if (config.selfVerify && !state.inVerification) {
			return {
				action: "verify",
				prompt: buildVerificationPrompt(state, config),
				reason: "completion promise detected — entering self-verification",
			}
		}
		// Work mode or already verified → done
		return {
			action: "stop",
			prompt: null,
			reason: "completion promise detected — loop complete",
		}
	}

	// ULW verification phase: check for verification promise
	if (state.inVerification && config.verificationPromise) {
		if (lastAssistantText.includes(config.verificationPromise)) {
			return {
				action: "stop",
				prompt: null,
				reason: "verification promise detected — loop verified and complete",
			}
		}
		// Verification found issues → back to work
		return {
			action: "continue",
			prompt: buildLoopContinuationPrompt(
				state,
				config,
				"Self-verification found issues. Fix them and emit the completion promise again when done.",
			),
			reason: "verification did not pass — continuing work",
		}
	}

	// Default: keep working
	return {
		action: "continue",
		prompt: buildLoopContinuationPrompt(state, config),
		reason: `iteration ${state.iteration + 1}/${config.maxIterations}`,
	}
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildLoopContinuationPrompt(
	state: LoopState,
	config: LoopConfig,
	extraContext?: string,
): string {
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - WORK LOOP]`)
	parts.push(`You are in an active ${state.mode} loop.`)
	parts.push(`Iteration: ${state.iteration + 1} of ${config.maxIterations}`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	if (extraContext) {
		parts.push(extraContext)
		parts.push("")
	}

	parts.push(`Continue working on the task. When ALL work is complete and verified, emit exactly:`)
	parts.push(config.completionPromise)
	parts.push("")
	parts.push(`Do not emit the completion promise until everything is truly done.`)

	return parts.join("\n")
}

function buildVerificationPrompt(
	state: LoopState,
	config: LoopConfig,
): string {
	const parts: string[] = []

	parts.push(`[SYSTEM REMINDER - SELF-VERIFICATION]`)
	parts.push(`You claimed completion. Now verify your work against the original requirements.`)
	parts.push("")

	if (state.taskPrompt) {
		parts.push(`Original task: ${state.taskPrompt}`)
		parts.push("")
	}

	parts.push(`Verification checklist:`)
	parts.push(`1. Re-read all changed files — confirm correctness`)
	parts.push(`2. Run tests, builds, and linters — confirm they pass`)
	parts.push(`3. Check every requirement from the original task — confirm each is met`)
	parts.push(`4. Check for regressions — confirm nothing else broke`)
	parts.push("")
	parts.push(`If everything passes, emit exactly: ${config.verificationPromise}`)
	parts.push(`If issues are found, fix them and then emit: ${config.completionPromise}`)

	return parts.join("\n")
}
