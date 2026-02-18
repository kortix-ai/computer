import { config } from '../../config';

// =============================================================================
// Model Registry
// =============================================================================

export interface ModelConfig {
  /** The actual model ID to send to OpenRouter */
  openrouterId: string;
  inputPer1M: number;   // Cost per 1M input tokens (USD)
  outputPer1M: number;  // Cost per 1M output tokens (USD)
  contextWindow: number;
  tier: 'free' | 'paid';
}

/**
 * Kortix model aliases → OpenRouter model IDs.
 *
 * Users can send `kortix/basic` and we resolve it to the actual model.
 * Any model NOT in this registry is passed through to OpenRouter as-is.
 */
export const MODELS: Record<string, ModelConfig> = {
  'kortix/basic': {
    openrouterId: 'anthropic/claude-sonnet-4.5',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    contextWindow: 200000,
    tier: 'free',
  },
  'kortix/power': {
    openrouterId: 'anthropic/claude-opus-4.6',
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    contextWindow: 200000,
    tier: 'paid',
  },
};

// =============================================================================
// Model Resolution
// =============================================================================

/**
 * Resolve a user-provided model ID to a ModelConfig.
 * - Known aliases (kortix/basic, etc.) → mapped config with pricing
 * - Unknown models → passed through to OpenRouter as-is (zero local pricing → use provider cost)
 */
export function getModel(modelId: string): ModelConfig {
  if (MODELS[modelId]) {
    return MODELS[modelId];
  }

  // Strip "openrouter/" prefix if present
  const openrouterId = modelId.startsWith('openrouter/')
    ? modelId.replace('openrouter/', '')
    : modelId;

  return {
    openrouterId,
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 128000,
    tier: 'paid',
  };
}

/**
 * Resolve a model ID to the OpenRouter model ID.
 * This is the ID that gets sent in the request body to OpenRouter.
 */
export function resolveOpenRouterId(modelId: string): string {
  return getModel(modelId).openrouterId;
}

/**
 * Get all available models for /v1/models endpoint.
 */
export function getAllModels() {
  return Object.entries(MODELS).map(([id, cfg]) => ({
    id,
    object: 'model' as const,
    owned_by: getProvider(id),
    context_window: cfg.contextWindow,
    pricing: {
      input: cfg.inputPer1M,
      output: cfg.outputPer1M,
    },
    tier: cfg.tier,
  }));
}

function getProvider(modelId: string): string {
  if (modelId.startsWith('kortix/')) return 'kortix';
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gpt') || modelId.startsWith('o1')) return 'openai';
  if (modelId.startsWith('grok')) return 'xai';
  if (modelId.startsWith('llama')) return 'groq';
  return 'openrouter';
}
