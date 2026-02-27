import { config } from '../../config';
import { getModelPricing } from './model-pricing';

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
  /** How this provider handles prompt caching. 'manual' = needs cache_control breakpoints (Anthropic). */
  cachingStrategy?: 'manual' | 'automatic';
  cacheReadPer1M?: number;   // Cost per 1M cached-read tokens (USD)
  cacheWritePer1M?: number;  // Cost per 1M cache-write tokens (USD)
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
    cachingStrategy: 'manual',
    cacheReadPer1M: 0.30,
    cacheWritePer1M: 3.75,
  },
  'kortix/power': {
    openrouterId: 'anthropic/claude-opus-4.6',
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    contextWindow: 200000,
    tier: 'paid',
    cachingStrategy: 'manual',
    cacheReadPer1M: 0.50,
    cacheWritePer1M: 6.25,
  },
};

// =============================================================================
// Model Resolution
// =============================================================================

/**
 * Resolve a user-provided model ID to a ModelConfig.
 * - Known Kortix aliases (kortix/basic, etc.) → mapped config with pricing
 * - Unknown models → look up live pricing from models.dev (refreshed every 24 h)
 * - If models.dev has no pricing → fall back to zero (billing will skip)
 */
export function getModel(modelId: string): ModelConfig {
  if (MODELS[modelId]) {
    return MODELS[modelId];
  }

  // Strip "openrouter/" prefix if present
  const openrouterId = modelId.startsWith('openrouter/')
    ? modelId.replace('openrouter/', '')
    : modelId;

  // Live pricing from models.dev — covers all major LLM providers
  const livePricing = getModelPricing(modelId);
  if (livePricing) {
    return {
      openrouterId,
      inputPer1M: livePricing.inputPer1M,
      outputPer1M: livePricing.outputPer1M,
      contextWindow: 128000,
      tier: 'paid',
    };
  }

  return {
    openrouterId,
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 128000,
    tier: 'paid',
    cachingStrategy: openrouterId.startsWith('anthropic/') ? 'manual' : undefined,
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
