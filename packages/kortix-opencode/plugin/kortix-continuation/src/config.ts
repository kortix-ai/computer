/**
 * Kortix Autowork — Configuration
 *
 * Single unified autowork mode. Always self-verifies. Always uses the maximum
 * iteration limit. No "light" mode — autowork means full autonomous execution.
 *
 * Keyword detection: autowork, ultrawork, ulw, hyperwork, gigawork in user
 * messages auto-activate the loop and set variant=max.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Regex that detects autowork activation keywords in user messages */
export const AUTOWORK_KEYWORDS = /\b(autowork|ultrawork|ulw|hyperwork|gigawork)\b/i

/** Marker appended to all system-injected continuation prompts.
 *  Prevents keyword detection from re-triggering on injected messages. */
export const INTERNAL_MARKER = "<!-- KORTIX_INTERNAL -->"

/** Strip code blocks before keyword detection */
export const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g
export const INLINE_CODE_PATTERN = /`[^`]+`/g

// ─── Feature Toggles ─────────────────────────────────────────────────────────

export interface ContinuationFeatures {
	/** Enable the continuation engine (session.idle → auto-continue) */
	continuation: boolean
	/** Enable the todo enforcer (check for unfinished tracked work) */
	todoEnforcer: boolean
	/** Enable the intent gate (classify user turns before continuing) */
	intentGate: boolean
	/** Enable the planner (auto-create plan files for complex tasks) */
	planner: boolean
}

// ─── Thresholds & Limits ─────────────────────────────────────────────────────

export interface ContinuationThresholds {
	/** Base cooldown (ms) between continuation attempts — exponentially backed off on failures */
	baseCooldownMs: number
	/** Max consecutive failures before entering hard pause */
	maxConsecutiveFailures: number
	/** How long (ms) to pause after hitting maxConsecutiveFailures */
	failureResetWindowMs: number
	/** Grace period (ms) after abort events — skip continuation during this window */
	abortGracePeriodMs: number
	/** Min time (ms) the agent must have been working before continuation kicks in */
	minWorkDurationMs: number
	/** Max total continuations per session (absolute safety cap for passive mode) */
	maxSessionContinuations: number
}

// ─── Full Config ──────────────────────────────────────────────────────────────

export interface ContinuationConfig {
	features: ContinuationFeatures
	thresholds: ContinuationThresholds
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_FEATURES: ContinuationFeatures = {
	continuation: true,      // passive continuation ON by default — todo enforcer drives it
	todoEnforcer: true,
	intentGate: true,
	planner: false,
}

export const DEFAULT_THRESHOLDS: ContinuationThresholds = {
	baseCooldownMs: 3_000,         // 3s minimum spacing between injections
	maxConsecutiveFailures: 5,
	failureResetWindowMs: 5 * 60_000,  // 5-minute hard pause after 5 consecutive failures
	abortGracePeriodMs: 3_000,    // 3s grace after abort events
	minWorkDurationMs: 8_000,     // agent must have worked at least 8s before passive kick-in
	maxSessionContinuations: 50,  // raised from 20 — passive mode is the safety net
}

export const DEFAULT_CONFIG: ContinuationConfig = {
	features: { ...DEFAULT_FEATURES },
	thresholds: { ...DEFAULT_THRESHOLDS },
}

// ─── Runtime State ────────────────────────────────────────────────────────────

/**
 * Mutable runtime state for the passive continuation engine.
 * Separate from LoopState which tracks the active autowork loop.
 */
export interface ContinuationState {
	/** Current session ID being tracked */
	sessionId: string | null
	/** Total continuations this session */
	totalSessionContinuations: number
	/** Timestamp when the current work cycle started (reset on user message) */
	workCycleStartedAt: number
}

export function createInitialState(): ContinuationState {
	return {
		sessionId: null,
		totalSessionContinuations: 0,
		workCycleStartedAt: 0,
	}
}

// ─── Config Helpers ───────────────────────────────────────────────────────────

/** Merge partial config into defaults */
export function mergeConfig(partial: Partial<ContinuationConfig>): ContinuationConfig {
	return {
		features: {
			...DEFAULT_FEATURES,
			...partial.features,
		},
		thresholds: {
			...DEFAULT_THRESHOLDS,
			...partial.thresholds,
		},
	}
}

// ─── Autowork Loop Configuration ──────────────────────────────────────────────

/** Single unified autowork loop config — always self-verifies, 500 max iterations */
export const AUTOWORK_LOOP_CONFIG = {
	maxIterations: 500,
	completionPromise: "<promise>DONE</promise>",
	verificationPromise: "<promise>VERIFIED</promise>",
	selfVerify: true,
} as const

/** Runtime state of an active (or inactive) autowork loop */
export interface LoopState {
	/** Whether a loop is currently active */
	active: boolean
	/** The original task prompt that started the loop */
	taskPrompt: string | null
	/** Current iteration count */
	iteration: number
	/** Session ID the loop is running in */
	sessionId: string | null
	/** Timestamp when the loop was started */
	startedAt: number
	/** Whether currently in self-verification phase */
	inVerification: boolean
	/** Number of messages at loop start — scan from here for promise detection */
	messageCountAtStart: number
	/** Consecutive injection failures — drives exponential backoff */
	consecutiveFailures: number
	/** Timestamp of last failure */
	lastFailureAt: number
	/** Timestamp of last successful injection */
	lastInjectedAt: number
	/** Whether continuation was explicitly stopped by /autowork-stop */
	stopped: boolean
	/** Timestamp of last detected abort event (for grace period) */
	lastAbortAt: number
}

/** Create a fresh loop state (no active loop) */
export function createInitialLoopState(): LoopState {
	return {
		active: false,
		taskPrompt: null,
		iteration: 0,
		sessionId: null,
		startedAt: 0,
		inVerification: false,
		messageCountAtStart: 0,
		consecutiveFailures: 0,
		lastFailureAt: 0,
		lastInjectedAt: 0,
		stopped: false,
		lastAbortAt: 0,
	}
}
