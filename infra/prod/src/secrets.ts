import * as aws from "@pulumi/aws";
import { commonTags, secretName } from "./config";

const SECRET_KEYS = [
  // Database & Supabase
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  // Auth
  "API_KEY_SECRET",
  // Sandbox Provisioning — Daytona
  "DAYTONA_API_KEY",
  "DAYTONA_SERVER_URL",
  "DAYTONA_TARGET",
  "DAYTONA_SNAPSHOT",
  // Sandbox Provisioning — Hetzner
  "HETZNER_API_KEY",
  "HETZNER_SNAPSHOT_ID",
  "HETZNER_SNAPSHOT_DESCRIPTION",
  // LLM Providers
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "XAI_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "AWS_BEARER_TOKEN_BEDROCK",
  // Billing — Stripe
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  // Billing — RevenueCat
  "REVENUECAT_API_KEY",
  "REVENUECAT_WEBHOOK_SECRET",
  "REVENUECAT_SECRET_KEY",
  // Integrations — Pipedream
  "PIPEDREAM_CLIENT_ID",
  "PIPEDREAM_CLIENT_SECRET",
  "PIPEDREAM_PROJECT_ID",
  // Tool Providers
  "TAVILY_API_KEY",
  "SERPER_API_KEY",
  "FIRECRAWL_API_KEY",
  "REPLICATE_API_TOKEN",
  "CONTEXT7_API_KEY",
  // Deployments — Freestyle
  "FREESTYLE_API_KEY",
  "FREESTYLE_API_URL",
  // Scheduler
  "CRON_TICK_SECRET",
  // Slack
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  // Channels
  "CHANNELS_CREDENTIAL_KEY",
  // Admin
  "KORTIX_ADMIN_API_KEY",
  // Internal
  "INTERNAL_SERVICE_KEY",
] as const;

export function createSecrets() {
  const placeholder = Object.fromEntries(
    SECRET_KEYS.map((key) => [key, "REPLACE_ME"]),
  );

  const secret = new aws.secretsmanager.Secret("kortix-api-config", {
    name: secretName,
    description: "Kortix API production secrets (JSON blob)",
    tags: commonTags,
  });

  new aws.secretsmanager.SecretVersion("kortix-api-config-initial", {
    secretId: secret.id,
    secretString: JSON.stringify(placeholder),
  });

  return { secret };
}
