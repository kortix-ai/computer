import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createXai } from '@ai-sdk/xai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { config } from '../../config';

// =============================================================================
// Provider Instances
// =============================================================================

// OpenRouter - fallback for any model
const openrouter = createOpenAICompatible({
  name: 'openrouter',
  baseURL: config.OPENROUTER_API_URL,
  apiKey: config.OPENROUTER_API_KEY,
});

// Direct providers (faster, no middleman)
const anthropic = createAnthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

const openai = createOpenAI({
  apiKey: config.OPENAI_API_KEY,
});

const xai = createXai({
  apiKey: config.XAI_API_KEY,
});

const groq = createOpenAICompatible({
  name: 'groq',
  baseURL: config.GROQ_API_URL,
  apiKey: config.GROQ_API_KEY,
});

// =============================================================================
// Model Registry
// =============================================================================

export interface ModelConfig {
  model: LanguageModel;
  inputPer1M: number;   // Cost per 1M input tokens (USD)
  outputPer1M: number;  // Cost per 1M output tokens (USD)
  contextWindow: number;
  tier: 'free' | 'paid';
}

export const MODELS: Record<string, ModelConfig> = {
  // -------------------------------------------------------------------------
  // Kortix Aliases (simple names for users)
  // -------------------------------------------------------------------------
  'kortix/basic': {
    model: openrouter('minimax/minimax-m2'),
    inputPer1M: 0.30,
    outputPer1M: 1.20,
    contextWindow: 200000,
    tier: 'free',
  },
  'kortix/power': {
    model: openrouter('moonshotai/kimi-k2.5'),
    inputPer1M: 0.60,
    outputPer1M: 3.00,
    contextWindow: 200000,
    tier: 'paid',
  },
};

// =============================================================================
// Model Resolution
// =============================================================================

/**
 * Get model config by ID.
 * Falls back to OpenRouter for unknown models.
 */
export function getModel(modelId: string): ModelConfig {
  // Direct lookup
  if (MODELS[modelId]) {
    return MODELS[modelId];
  }

  // OpenRouter passthrough (e.g., "openrouter/meta-llama/llama-3-70b")
  if (modelId.startsWith('openrouter/')) {
    const actualModel = modelId.replace('openrouter/', '');
    return {
      model: openrouter(actualModel),
      inputPer1M: 0, // Use provider-reported cost
      outputPer1M: 0,
      contextWindow: 128000,
      tier: 'paid',
    };
  }

  // Fallback: route unknown models through OpenRouter
  return {
    model: openrouter(modelId),
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 128000,
    tier: 'paid',
  };
}

/**
 * Get all available models for /v1/models endpoint.
 */
export function getAllModels() {
  return Object.entries(MODELS).map(([id, config]) => ({
    id,
    object: 'model' as const,
    owned_by: getProvider(id),
    context_window: config.contextWindow,
    pricing: {
      input: config.inputPer1M,
      output: config.outputPer1M,
    },
    tier: config.tier,
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
