export const config = {
  PORT: parseInt(process.env.PORT || '8008', 10),
  ENV_MODE: process.env.ENV_MODE || 'local',

  TAVILY_API_URL: process.env.TAVILY_API_URL || 'https://api.tavily.com',
  SERPER_API_URL: process.env.SERPER_API_URL || 'https://google.serper.dev',

  TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
  SERPER_API_KEY: process.env.SERPER_API_KEY || '',

  FIRECRAWL_API_URL: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev',

  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '',

  REPLICATE_API_URL: process.env.REPLICATE_API_URL || 'https://api.replicate.com',

  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || '',

  CONTEXT7_API_URL: process.env.CONTEXT7_API_URL || 'https://context7.com',
  CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || '',

  OPENROUTER_API_URL: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1',
  ANTHROPIC_API_URL: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
  OPENAI_API_URL: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
  XAI_API_URL: process.env.XAI_API_URL || 'https://api.x.ai/v1',
  GEMINI_API_URL: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  GROQ_API_URL: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1',

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  XAI_API_KEY: process.env.XAI_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK || '',

  DATABASE_URL: process.env.DATABASE_URL || '',

  BILLING_SERVICE_URL: process.env.BILLING_SERVICE_URL || 'http://localhost:8013',

  BACKEND_API_URL: process.env.BACKEND_API_URL || 'http://localhost:8000',
  BACKEND_API_KEY: process.env.BACKEND_API_KEY || '',

  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  API_KEY_SECRET: process.env.API_KEY_SECRET || '',

  isLocal(): boolean {
    return this.ENV_MODE === 'local';
  },

  isDevelopment(): boolean {
    return this.ENV_MODE === 'local' || this.ENV_MODE === 'staging';
  },
};

export interface ToolPricing {
  baseCost: number;
  perResultCost: number;
  markupMultiplier: number;
}
  
export const TOOL_PRICING: Record<string, ToolPricing> = {
  web_search_basic: {
    baseCost: 0.005,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  web_search_advanced: {
    baseCost: 0.025,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  image_search: {
    baseCost: 0.001,
    perResultCost: 0,
    markupMultiplier: 2.0,
  },

  proxy_tavily: {
    baseCost: 0.005,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  proxy_serper: {
    baseCost: 0.001,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  proxy_firecrawl: {
    baseCost: 0.01,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  proxy_replicate: {
    baseCost: 0.005,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  proxy_replicate_nano_banana: {
    baseCost: 0.01,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  proxy_replicate_gpt_image: {
    baseCost: 0.05,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
  proxy_context7: {
    baseCost: 0.001,
    perResultCost: 0,
    markupMultiplier: 1.5,
  },
};

export function getToolCost(toolName: string, resultCount: number = 0): number {
  const pricing = TOOL_PRICING[toolName];
  if (!pricing) {
    return 0.01;
  }

  const base = pricing.baseCost * pricing.markupMultiplier;
  const perResult = pricing.perResultCost * pricing.markupMultiplier * resultCount;
  return base + perResult;
}

export interface LLMPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
  markupMultiplier: number;
}

export const LLM_PRICING: Record<string, LLMPricing> = {
  openrouter: {
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    markupMultiplier: 1.2,
  },
  anthropic: {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    markupMultiplier: 1.2,
  },
  openai: {
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    markupMultiplier: 1.2,
  },
  xai: {
    inputCostPer1M: 2.0,
    outputCostPer1M: 10.0,
    markupMultiplier: 1.2,
  },
  groq: {
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.08,
    markupMultiplier: 1.2,
  },
  gemini: {
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    markupMultiplier: 1.2,
  },
};

export function calculateLLMCost(
  provider: string,
  inputTokens: number,
  outputTokens: number,
  providerReportedCost?: number
): number {
  const pricing = LLM_PRICING[provider] || LLM_PRICING['openrouter'];

  if (provider === 'openrouter' && providerReportedCost !== undefined) {
    return providerReportedCost * pricing.markupMultiplier;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
  return (inputCost + outputCost) * pricing.markupMultiplier;
}
