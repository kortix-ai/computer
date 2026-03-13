export {
	type ContinuationConfig,
	type ContinuationFeatures,
	type ContinuationThresholds,
	type ContinuationState,
	type LoopMode,
	type LoopConfig,
	type LoopState,
	DEFAULT_CONFIG,
	DEFAULT_FEATURES,
	DEFAULT_THRESHOLDS,
	DEFAULT_LOOP_CONFIGS,
	createInitialState,
	createInitialLoopState,
	allFeaturesEnabled,
	mergeConfig,
} from "./config"

export {
	type Intent,
	type IntentResult,
	classifyIntent,
} from "./intent-gate"

export {
	type TodoVerdict,
	type TodoEnforcerResult,
	evaluateTodos,
	formatRemainingWork,
} from "./todo-enforcer"

export {
	type ContinuationAction,
	type ContinuationDecision,
	evaluate,
} from "./continuation-engine"

export {
	type PlanSection,
	type PlanItem,
	getPlanPath,
	planExists,
	readPlan,
	writePlan,
	generatePlanTemplate,
	planHasUnfinishedWork,
} from "./planner"

export {
	type UltraworkOptions,
	activateUltrawork,
	deactivateUltrawork,
	shouldSuggestUltrawork,
} from "./ultrawork"

export {
	type LoopAction,
	type LoopDecision,
	evaluateLoop,
	startLoop,
	stopLoop,
	advanceIteration,
	enterVerification,
	exitVerification,
	persistLoopState,
	loadPersistedLoopState,
} from "./loop"
