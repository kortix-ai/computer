/**
 * Continuation Engine — Configuration
 *
 * Feature toggles, thresholds, and runtime config for the Kortix
 * continuation engine. All settings have safe defaults. Config can
 * be overridden programmatically (e.g., by Ultrawork mode).
 */

// ─── Feature Toggles ────────────────────────────────────────────────────────

export interface ContinuationFeatures {
	/** Enable the continuation engine (session.idle → auto-continue) */
	continuation: boolean
	/** Enable the todo enforcer (check for unfinished tracked work) */
	todoEnforcer: boolean
	/** Enable the intent gate (classify user turns before continuing) */
	intentGate: boolean
	/** Enable the planner (auto-create plan files for complex tasks) */
	planner: boolean
	/** Enable ultrawork mode (all features + delegation defaults) */
	ultrawork: boolean
}

// ─── Thresholds & Limits ─────────────────────────────────────────────────────

export interface ContinuationThresholds {
	/** Max consecutive continuations before forcing a stop (safety valve) */
	maxContinuations: number
	/** Cooldown (ms) between continuation attempts — prevents rapid-fire loops */
	cooldownMs: number
	/** Min time (ms) the agent must have been working before continuation kicks in */
	minWorkDurationMs: number
	/** Max total continuations per session (absolute safety cap) */
	maxSessionContinuations: number
}

// ─── Full Config ─────────────────────────────────────────────────────────────

export interface ContinuationConfig {
	features: ContinuationFeatures
	thresholds: ContinuationThresholds
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_FEATURES: ContinuationFeatures = {
	continuation: false,
	todoEnforcer: true,
	intentGate: true,
	planner: false,
	ultrawork: false,
}

export const DEFAULT_THRESHOLDS: ContinuationThresholds = {
	maxContinuations: 5,
	cooldownMs: 3_000,
	minWorkDurationMs: 5_000,
	maxSessionContinuations: 20,
}

export const DEFAULT_CONFIG: ContinuationConfig = {
	features: { ...DEFAULT_FEATURES },
	thresholds: { ...DEFAULT_THRESHOLDS },
}

// ─── Runtime State ───────────────────────────────────────────────────────────

/**
 * Mutable runtime state for the continuation engine.
 * Tracks per-session continuation counts and timing.
 */
export interface ContinuationState {
	/** Current session ID being tracked */
	sessionId: string | null
	/** Number of consecutive continuations (resets on user message) */
	consecutiveContinuations: number
	/** Total continuations this session */
	totalSessionContinuations: number
	/** Timestamp of last continuation attempt */
	lastContinuationAt: number
	/** Timestamp when the current work cycle started (reset on user message) */
	workCycleStartedAt: number
	/** Whether ultrawork mode is active */
	ultraworkActive: boolean
}

export function createInitialState(): ContinuationState {
	return {
		sessionId: null,
		consecutiveContinuations: 0,
		totalSessionContinuations: 0,
		lastContinuationAt: 0,
		workCycleStartedAt: 0,
		ultraworkActive: false,
	}
}

// ─── Config Helpers ──────────────────────────────────────────────────────────

/** Create a config with all features enabled (used by ultrawork mode) */
export function allFeaturesEnabled(overrides?: Partial<ContinuationThresholds>): ContinuationConfig {
	return {
		features: {
			continuation: true,
			todoEnforcer: true,
			intentGate: true,
			planner: true,
			ultrawork: true,
		},
		thresholds: {
			...DEFAULT_THRESHOLDS,
			// Ultrawork gets more generous limits
			maxContinuations: 10,
			maxSessionContinuations: 50,
			...overrides,
		},
	}
}

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

// ─── Loop Configuration ─────────────────────────────────────────────────────

/** Loop mode: bounded (work) or verified with self-check (ulw) */
export type LoopMode = "work" | "ulw"

/** Configuration for a specific loop mode */
export interface LoopConfig {
	/** Max iterations before forced stop */
	maxIterations: number
	/** Text pattern the agent emits to signal completion */
	completionPromise: string
	/** Text pattern for verification pass (ULW only) */
	verificationPromise: string
	/** Whether to require self-verification before completing */
	selfVerify: boolean
}

/** Runtime state of an active (or inactive) loop */
export interface LoopState {
	/** Whether a loop is currently active */
	active: boolean
	/** Current loop mode */
	mode: LoopMode | null
	/** The original task prompt that started the loop */
	taskPrompt: string | null
	/** Current iteration count */
	iteration: number
	/** Session ID the loop is running in */
	sessionId: string | null
	/** Timestamp when the loop was started */
	startedAt: number
	/** Whether currently in self-verification phase (ULW) */
	inVerification: boolean
}

/** Default loop configs per mode */
export const DEFAULT_LOOP_CONFIGS: Record<LoopMode, LoopConfig> = {
	work: {
		maxIterations: 100,
		completionPromise: "<promise>DONE</promise>",
		verificationPromise: "",
		selfVerify: false,
	},
	ulw: {
		maxIterations: 500,
		completionPromise: "<promise>DONE</promise>",
		verificationPromise: "<promise>VERIFIED</promise>",
		selfVerify: true,
	},
}

/** Create a fresh loop state (no active loop) */
export function createInitialLoopState(): LoopState {
	return {
		active: false,
		mode: null,
		taskPrompt: null,
		iteration: 0,
		sessionId: null,
		startedAt: 0,
		inVerification: false,
	}
}
