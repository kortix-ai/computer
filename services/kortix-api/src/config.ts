export type SandboxProviderType = 'daytona' | 'local_docker' | 'auto';

export const config = {
  PORT: parseInt(process.env.PORT || '8008', 10),
  // local | cloud — matches frontend's EnvMode
  ENV_MODE: process.env.ENV_MODE || 'local',
  // staging | production — controls which Stripe price IDs to use (cloud only)
  STRIPE_ENV: (process.env.STRIPE_ENV || 'production') as 'staging' | 'production',

  // ─── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: process.env.DATABASE_URL || '',

  // ─── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || '',

  // ─── API Key Hashing ──────────────────────────────────────────────────────
  API_KEY_SECRET: process.env.API_KEY_SECRET || '',

  // ─── Search Providers ──────────────────────────────────────────────────────
  TAVILY_API_URL: process.env.TAVILY_API_URL || 'https://api.tavily.com',
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',

  SERPER_API_URL: process.env.SERPER_API_URL || 'https://google.serper.dev',
  SERPER_API_KEY: process.env.SERPER_API_KEY || '',

  // ─── Proxy Providers ──────────────────────────────────────────────────────
  FIRECRAWL_API_URL: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev',
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '',

  REPLICATE_API_URL: process.env.REPLICATE_API_URL || 'https://api.replicate.com',
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || '',

  CONTEXT7_API_URL: process.env.CONTEXT7_API_URL || 'https://context7.com',
  CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || '',

  // ─── LLM Providers ────────────────────────────────────────────────────────
  OPENROUTER_API_URL: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',

  ANTHROPIC_API_URL: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  OPENAI_API_URL: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  XAI_API_URL: process.env.XAI_API_URL || 'https://api.x.ai/v1',
  XAI_API_KEY: process.env.XAI_API_KEY || '',

  GEMINI_API_URL: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  GROQ_API_URL: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',

  AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK || '',

  // ─── Stripe (Billing) ─────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

  // ─── RevenueCat (Billing) ─────────────────────────────────────────────────
  REVENUECAT_API_KEY: process.env.REVENUECAT_API_KEY || '',
  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET || '',

  // ─── Daytona (Sandbox provisioning + preview proxy) ───────────────────────
  DAYTONA_API_KEY: process.env.DAYTONA_API_KEY || '',
  DAYTONA_SERVER_URL: process.env.DAYTONA_SERVER_URL || '',
  DAYTONA_TARGET: process.env.DAYTONA_TARGET || '',
  DAYTONA_SNAPSHOT: process.env.DAYTONA_SNAPSHOT || '',

  // ─── Sandbox Provisioning (Platform) ──────────────────────────────────────
  KORTIX_URL: process.env.KORTIX_URL || '',
  SANDBOX_PROVIDER: (process.env.SANDBOX_PROVIDER || 'auto') as SandboxProviderType,
  SANDBOX_IMAGE: process.env.SANDBOX_IMAGE || 'kortix/computer:latest',
  DOCKER_HOST: process.env.DOCKER_HOST || '',
  SANDBOX_NETWORK: process.env.SANDBOX_NETWORK || '',
  /**
   * Base host port used for local Docker sandbox fixed port mappings.
   * The sandbox uses 7 contiguous ports starting at this base.
   */
  SANDBOX_PORT_BASE: parseInt(process.env.SANDBOX_PORT_BASE || '14000', 10),

  /**
   * Optional bearer token to protect sandbox proxy access in local/VPS mode.
   * If set, all requests through /v1/preview/{sandboxId}/* must present this token
   * via Authorization header or ?token= query param.
   * If unset, sandbox proxy is open (backward compatible).
   */
  SANDBOX_AUTH_TOKEN: process.env.SANDBOX_AUTH_TOKEN || '',

  /**
   * Internal service key for kortix-api → sandbox communication.
   * Injected into proxied requests so the sandbox can validate the caller.
   * In VPS mode this is auto-generated; in local mode defaults to empty (no auth).
   */
  INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY || '',

  // ─── Scheduler (Cron) ─────────────────────────────────────────────────────
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED !== 'false',
  /** If set, enables pg_cron mode: external ticks via POST /v1/cron/tick with this secret */
  CRON_TICK_SECRET: process.env.CRON_TICK_SECRET || '',
  /** URL pg_cron uses to call the tick endpoint */
  CRON_API_URL: process.env.CRON_API_URL || '',

  // ─── Channels ───────────────────────────────────────────────────────────────
  CHANNELS_ENABLED: process.env.CHANNELS_ENABLED !== 'false',
  CHANNELS_PUBLIC_URL: process.env.CHANNELS_PUBLIC_URL || '',
  /** 64-char hex string (32 bytes) for AES-256-GCM credential encryption. Omit to disable. */
  CHANNELS_CREDENTIAL_KEY: process.env.CHANNELS_CREDENTIAL_KEY || '',

  // ─── Frontend ────────────────────────────────────────────────────────────
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // ─── Integrations (OAuth Provider) ───────────────────────────────────────
  INTEGRATION_AUTH_PROVIDER: process.env.INTEGRATION_AUTH_PROVIDER || 'pipedream',
  PIPEDREAM_CLIENT_ID: process.env.PIPEDREAM_CLIENT_ID || '',
  PIPEDREAM_CLIENT_SECRET: process.env.PIPEDREAM_CLIENT_SECRET || '',
  PIPEDREAM_PROJECT_ID: process.env.PIPEDREAM_PROJECT_ID || '',
  PIPEDREAM_ENVIRONMENT: process.env.PIPEDREAM_ENVIRONMENT || 'development',

  // ─── Slack (Platform App) ─────────────────────────────────────────────────
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || '',
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || '',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',

  // ─── Helper Methods ────────────────────────────────────────────────────────

  isLocal(): boolean {
    return this.ENV_MODE === 'local';
  },

  isCloud(): boolean {
    return !this.isLocal();
  },

  isDaytonaEnabled(): boolean {
    if (this.SANDBOX_PROVIDER === 'daytona') return true;
    if (this.SANDBOX_PROVIDER === 'local_docker') return false;
    return !!this.DAYTONA_API_KEY;
  },

  isLocalDockerEnabled(): boolean {
    if (this.SANDBOX_PROVIDER === 'local_docker') return true;
    if (this.SANDBOX_PROVIDER === 'daytona') return false;
    return true;
  },

  /** True when a sandbox auth token is configured (local/VPS protection enabled). */
  hasSandboxAuth(): boolean {
    return !!this.SANDBOX_AUTH_TOKEN;
  },
};

// ─── Tool Pricing (Router) ──────────────────────────────────────────────────

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

// ─── LLM Pricing (Router) ───────────────────────────────────────────────────

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
