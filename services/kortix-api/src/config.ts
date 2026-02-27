export type SandboxProviderName = 'daytona' | 'local_docker';

/** Single source of truth for the sandbox version. Update on each release. */
export const SANDBOX_VERSION = '0.7.2';

/** Parse comma-separated provider list (e.g. "daytona,local_docker") */
function parseAllowedProviders(raw: string): SandboxProviderName[] {
  if (!raw) return ['local_docker'];
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid: SandboxProviderName[] = [];
  for (const n of names) {
    if (n === 'daytona' || n === 'local_docker') {
      if (!valid.includes(n)) valid.push(n);
    } else {
      console.warn(`[config] Unknown sandbox provider "${n}" in ALLOWED_SANDBOX_PROVIDERS — ignored`);
    }
  }
  return valid.length > 0 ? valid : ['local_docker'];
}

export type InternalKortixEnv = 'dev' | 'staging' | 'prod';

export const config = {
  PORT: parseInt(process.env.PORT || '8008', 10),
  // local | cloud — matches frontend's EnvMode
  ENV_MODE: process.env.ENV_MODE || 'local',

  // ─── Internal Deployment Controls ─────────────────────────────────────────
  // dev | staging | prod — controls Stripe price IDs, analytics, log levels.
  // Does NOT affect auth or routing. Replaces the old STRIPE_ENV.
  INTERNAL_KORTIX_ENV: (process.env.INTERNAL_KORTIX_ENV || 'dev') as InternalKortixEnv,
  // Enables Kortix Cloud internal router features (model routing, usage tracking, cost allocation).
  // Default false — safe for self-hosted.
  KORTIX_ROUTER_INTERNAL_ENABLED: process.env.KORTIX_ROUTER_INTERNAL_ENABLED === 'true',
  // Enables billing features (Stripe integration, credit system, usage metering).
  // Default false — safe for self-hosted.
  KORTIX_BILLING_INTERNAL_ENABLED: process.env.KORTIX_BILLING_INTERNAL_ENABLED === 'true',

  // ─── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: process.env.DATABASE_URL || '',

  // ─── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

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

  // ─── Freestyle (Deployments) ──────────────────────────────────────────────
  FREESTYLE_API_URL: process.env.FREESTYLE_API_URL || 'https://api.freestyle.sh',
  FREESTYLE_API_KEY: process.env.FREESTYLE_API_KEY || '',

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
  DAYTONA_SNAPSHOT: `kortix-sandbox-v${SANDBOX_VERSION}`,

  // ─── Sandbox Provisioning (Platform) ──────────────────────────────────────
  KORTIX_URL: process.env.KORTIX_URL || '',
  /**
   * Comma-separated list of allowed sandbox providers.
   * e.g. "daytona,local_docker" or just "local_docker"
   * First entry is the default provider for new sandboxes.
   */
  ALLOWED_SANDBOX_PROVIDERS: parseAllowedProviders(process.env.ALLOWED_SANDBOX_PROVIDERS || ''),
  SANDBOX_IMAGE: `kortix/sandbox:${SANDBOX_VERSION}`,
  DOCKER_HOST: process.env.DOCKER_HOST || '',
  SANDBOX_NETWORK: process.env.SANDBOX_NETWORK || '',
  /**
   * Base host port used for local Docker sandbox fixed port mappings.
   * The sandbox uses 8 contiguous ports starting at this base.
   */
  SANDBOX_PORT_BASE: parseInt(process.env.SANDBOX_PORT_BASE || '14000', 10),

  /**
   * INTERNAL_SERVICE_KEY — direction: kortix-api → sandbox.
   *
   * This is how kortix-api authenticates itself TO the sandbox. Every request
   * from kortix-api to the sandbox (proxy, cron, health, queue drain, etc.)
   * includes `Authorization: Bearer <INTERNAL_SERVICE_KEY>`. The sandbox's
   * kortix-master middleware validates it.
   *
   * Counterpart: KORTIX_TOKEN goes the other direction (sandbox → kortix-api).
   *
   * Auto-generated at startup if not provided — always present.
   * Persisted to .env so the same key survives process restarts.
   */
  get INTERNAL_SERVICE_KEY(): string {
    if (!process.env.INTERNAL_SERVICE_KEY) {
      const { randomBytes } = require('crypto');
      const generated = randomBytes(32).toString('hex');
      process.env.INTERNAL_SERVICE_KEY = generated;
      console.log('[config] Auto-generated INTERNAL_SERVICE_KEY for sandbox auth');
      // Persist to .env so the key survives process restarts (avoids re-sync on every restart)
      try {
        const { appendFileSync, readFileSync, existsSync } = require('fs');
        const { resolve } = require('path');
        const candidates = [
          resolve(__dirname, '../../.env'),       // from src/config.ts → ../../.env
          resolve(process.cwd(), '.env'),          // cwd/.env
        ];
        for (const envPath of candidates) {
          if (existsSync(envPath)) {
            const content = readFileSync(envPath, 'utf-8');
            if (!content.includes('INTERNAL_SERVICE_KEY=')) {
              appendFileSync(envPath, `\n# Auto-generated service key for sandbox auth (do not remove)\nINTERNAL_SERVICE_KEY=${generated}\n`);
              console.log(`[config] Persisted INTERNAL_SERVICE_KEY to ${envPath}`);
            }
            break;
          }
        }
      } catch (err: any) {
        // Non-fatal — key still works in-memory for this process lifetime
        console.warn('[config] Could not persist INTERNAL_SERVICE_KEY to .env:', err.message);
      }
    }
    return process.env.INTERNAL_SERVICE_KEY;
  },

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

  // ─── Session Pruning (LLM Context) ───────────────────────────────────────
  /** Master switch — set to 'false' to disable pruning entirely. */
  SESSION_PRUNING_ENABLED: process.env.SESSION_PRUNING_ENABLED !== 'false',
  /** Idle TTL in ms before pruning activates (default 5 min). */
  SESSION_PRUNING_TTL_MS: parseInt(process.env.SESSION_PRUNING_TTL_MS || '', 10) || 5 * 60 * 1000,
  /** Number of trailing assistant turns whose tool results are protected. */
  SESSION_PRUNING_KEEP_LAST: parseInt(process.env.SESSION_PRUNING_KEEP_LAST || '', 10) || 3,
  /** Context fill ratio that triggers soft-trim (0-1). */
  SESSION_PRUNING_SOFT_RATIO: parseFloat(process.env.SESSION_PRUNING_SOFT_RATIO || '') || 0.3,
  /** Context fill ratio that triggers hard-clear (0-1). */
  SESSION_PRUNING_HARD_RATIO: parseFloat(process.env.SESSION_PRUNING_HARD_RATIO || '') || 0.5,
  /** Min total prunable chars before hard-clear kicks in. */
  SESSION_PRUNING_MIN_CHARS: parseInt(process.env.SESSION_PRUNING_MIN_CHARS || '', 10) || 50_000,
  /** Individual tool result size threshold for soft-trim (chars). */
  SESSION_PRUNING_SOFT_MAX: parseInt(process.env.SESSION_PRUNING_SOFT_MAX || '', 10) || 4_000,
  /** Chars kept from the start during soft-trim. */
  SESSION_PRUNING_SOFT_HEAD: parseInt(process.env.SESSION_PRUNING_SOFT_HEAD || '', 10) || 1_500,
  /** Chars kept from the end during soft-trim. */
  SESSION_PRUNING_SOFT_TAIL: parseInt(process.env.SESSION_PRUNING_SOFT_TAIL || '', 10) || 1_500,
  /** Enable/disable the hard-clear phase. */
  SESSION_PRUNING_HARD_ENABLED: process.env.SESSION_PRUNING_HARD_ENABLED !== 'false',
  /** Placeholder text for hard-cleared tool results. */
  SESSION_PRUNING_HARD_PLACEHOLDER: process.env.SESSION_PRUNING_HARD_PLACEHOLDER || '[Old tool result content cleared]',

  // ─── Frontend ────────────────────────────────────────────────────────────
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // ─── Integrations (OAuth Provider) ───────────────────────────────────────
  INTEGRATION_AUTH_PROVIDER: process.env.INTEGRATION_AUTH_PROVIDER || 'pipedream',
  PIPEDREAM_CLIENT_ID: process.env.PIPEDREAM_CLIENT_ID || '',
  PIPEDREAM_CLIENT_SECRET: process.env.PIPEDREAM_CLIENT_SECRET || '',
  PIPEDREAM_PROJECT_ID: process.env.PIPEDREAM_PROJECT_ID || '',
  PIPEDREAM_ENVIRONMENT: process.env.PIPEDREAM_ENVIRONMENT || 'development',

  // ─── Tunnel (Reverse-Tunnel to Local Machine) ──────────────────────────────
  TUNNEL_ENABLED: process.env.TUNNEL_ENABLED !== 'false',
  /** Heartbeat interval for tunnel agents (ms). Agent sends ping, server expects pong. */
  TUNNEL_HEARTBEAT_INTERVAL_MS: parseInt(process.env.TUNNEL_HEARTBEAT_INTERVAL_MS || '30000', 10),
  /** Max missed heartbeats before marking tunnel offline. */
  TUNNEL_HEARTBEAT_MAX_MISSED: parseInt(process.env.TUNNEL_HEARTBEAT_MAX_MISSED || '3', 10),
  /** Default timeout for RPC calls relayed to local agent (ms). */
  TUNNEL_RPC_TIMEOUT_MS: parseInt(process.env.TUNNEL_RPC_TIMEOUT_MS || '30000', 10),
  /** Max file size for tunnel filesystem operations (bytes). */
  TUNNEL_MAX_FILE_SIZE: parseInt(process.env.TUNNEL_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10),
  /** TTL for tunnel permission requests before auto-expiring (ms). */
  TUNNEL_PERMISSION_REQUEST_TTL_MS: parseInt(process.env.TUNNEL_PERMISSION_REQUEST_TTL_MS || '300000', 10),
  /** Rate limits for tunnel endpoints (requests per 60s window). */
  TUNNEL_RATE_LIMIT_RPC: parseInt(process.env.TUNNEL_RATE_LIMIT_RPC || '100', 10),
  TUNNEL_RATE_LIMIT_PERM_REQUEST: parseInt(process.env.TUNNEL_RATE_LIMIT_PERM_REQUEST || '20', 10),
  TUNNEL_RATE_LIMIT_WS_CONNECT: parseInt(process.env.TUNNEL_RATE_LIMIT_WS_CONNECT || '5', 10),
  TUNNEL_RATE_LIMIT_PERM_GRANT: parseInt(process.env.TUNNEL_RATE_LIMIT_PERM_GRANT || '30', 10),
  /** Max WebSocket message size for tunnel agents (bytes). Default 5MB. */
  TUNNEL_MAX_WS_MESSAGE_SIZE: parseInt(process.env.TUNNEL_MAX_WS_MESSAGE_SIZE || String(5 * 1024 * 1024), 10),

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
    return this.ALLOWED_SANDBOX_PROVIDERS.includes('daytona') && !!this.DAYTONA_API_KEY;
  },

  isLocalDockerEnabled(): boolean {
    return this.ALLOWED_SANDBOX_PROVIDERS.includes('local_docker');
  },

  /** The first provider in ALLOWED_SANDBOX_PROVIDERS is the default. */
  getDefaultProvider(): SandboxProviderName {
    return this.ALLOWED_SANDBOX_PROVIDERS[0] ?? 'local_docker';
  },

};

// ─── Billing Markup Constants ────────────────────────────────────────────────
//
// Two pricing modes based on whose API key is used:
//   • Kortix keys (user uses our keys):  1.2x provider cost (20% markup)
//   • User's own keys (passthrough):     0.1x provider cost (10% platform fee)

/** Markup when Kortix provides the API key. */
export const KORTIX_MARKUP = 1.2;

/** Platform fee when user provides their own API key. */
export const PLATFORM_FEE_MARKUP = 0.1;

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
  proxy_freestyle_deploy: {
    baseCost: 0.01,
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
