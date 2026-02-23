import { config, KORTIX_MARKUP } from '../../config';
import { getModel, getAllModels, resolveOpenRouterId, type ModelConfig } from '../config/models';

/**
 * Calculate cost based on token usage and model pricing.
 *
 * @param markup - Multiplier applied to the raw provider cost.
 *   Defaults to KORTIX_MARKUP (1.2× = 20% markup) when Kortix provides the key.
 *   Pass PLATFORM_FEE_MARKUP (0.1× = 10% platform fee) for user-owned keys.
 */
export function calculateCost(
  modelConfig: ModelConfig,
  promptTokens: number,
  completionTokens: number,
  markup: number = KORTIX_MARKUP,
): number {
  const inputCost = (promptTokens / 1_000_000) * modelConfig.inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * modelConfig.outputPer1M;
  return (inputCost + outputCost) * markup;
}

/**
 * Forward a chat completion request to OpenRouter as a 1:1 passthrough proxy.
 * Preserves the full request body (tools, tool_choice, response_format, etc).
 *
 * @returns The raw fetch Response from OpenRouter (may be streaming or not).
 */
export async function proxyToOpenRouter(
  body: Record<string, unknown>,
  isStreaming: boolean
): Promise<Response> {
  const modelId = body.model as string;
  const openrouterId = resolveOpenRouterId(modelId);

  // Rewrite the model field to the actual OpenRouter model ID
  const forwardBody = { ...body, model: openrouterId };

  const url = `${config.OPENROUTER_API_URL}/chat/completions`;

  console.log(`[LLM] Proxying to OpenRouter: ${modelId} → ${openrouterId} (stream=${isStreaming})`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
      'HTTP-Referer': config.FRONTEND_URL || 'https://kortix.ai',
      'X-Title': 'Kortix',
    },
    body: JSON.stringify(forwardBody),
  });

  return response;
}

/**
 * Extract usage from a non-streaming OpenAI-compatible response body.
 */
export function extractUsage(responseBody: any): { promptTokens: number; completionTokens: number } | null {
  if (!responseBody?.usage) return null;
  return {
    promptTokens: responseBody.usage.prompt_tokens ?? 0,
    completionTokens: responseBody.usage.completion_tokens ?? 0,
  };
}

// Re-export model functions
export { getModel, getAllModels, resolveOpenRouterId } from '../config/models';
