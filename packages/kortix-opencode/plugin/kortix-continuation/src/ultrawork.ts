/**
 * Ultrawork — Thin mode wrapper
 *
 * Enables all continuation features at once for hard tasks.
 * Ultrawork is NOT a separate system — it's a config preset that
 * turns on continuation + todo enforcer + intent gate + planner
 * with more generous limits.
 */

import { allFeaturesEnabled, type ContinuationConfig, type ContinuationState, type ContinuationThresholds } from "./config"

export interface UltraworkOptions {
	thresholdOverrides?: Partial<ContinuationThresholds>
}

/**
 * Activate ultrawork mode. Returns the config to use and mutates state.
 */
export function activateUltrawork(
	state: ContinuationState,
	options?: UltraworkOptions,
): ContinuationConfig {
	state.ultraworkActive = true
	return allFeaturesEnabled(options?.thresholdOverrides)
}

/**
 * Deactivate ultrawork mode. Returns default config and mutates state.
 */
export function deactivateUltrawork(
	state: ContinuationState,
	fallbackConfig: ContinuationConfig,
): ContinuationConfig {
	state.ultraworkActive = false
	return fallbackConfig
}

/**
 * Check if ultrawork mode should be suggested based on task complexity signals.
 * This is a lightweight heuristic — the actual activation is user-triggered.
 */
export function shouldSuggestUltrawork(
	todoCount: number,
	taskDescription: string,
): boolean {
	if (todoCount >= 5) return true

	const complexitySignals = [
		/\b(?:refactor|migrate|overhaul|rewrite|rearchitect)\b/i,
		/\b(?:e2e|end.to.end|full.stack|multi.?module)\b/i,
		/\b(?:implement|build|create|ship)\b.*\b(?:system|engine|framework|pipeline)\b/i,
	]
	return complexitySignals.some(p => p.test(taskDescription))
}
