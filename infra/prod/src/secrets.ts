import * as aws from "@pulumi/aws";
import { commonTags, secretName } from "./config";

const SECRET_KEYS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "API_KEY_SECRET",
  "DAYTONA_API_KEY",
  "DAYTONA_SERVER_URL",
  "DAYTONA_TARGET",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "REVENUECAT_API_KEY",
  "REVENUECAT_WEBHOOK_SECRET",
  "PIPEDREAM_CLIENT_ID",
  "PIPEDREAM_CLIENT_SECRET",
  "PIPEDREAM_PROJECT_ID",
  "TAVILY_API_KEY",
  "SERPER_API_KEY",
  "FIRECRAWL_API_KEY",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  "INTERNAL_SERVICE_KEY",
  "CHANNELS_CREDENTIAL_KEY",
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
