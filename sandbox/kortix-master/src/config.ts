/**
 * Parse SANDBOX_PORT_MAP env var into a Record<containerPort, hostPort>.
 * Format: JSON object, e.g. {"8000":"14000","6080":"14002"}
 */
function parsePortMap(): Record<string, string> {
  const raw = process.env.SANDBOX_PORT_MAP
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    console.warn('[Kortix Master] Failed to parse SANDBOX_PORT_MAP:', raw)
    return {}
  }
}

export const config = {
  // Kortix Master port (main entry point)
  PORT: parseInt(process.env.KORTIX_MASTER_PORT || '8000'),

  // OpenCode server (proxied, always unprotected)
  OPENCODE_HOST: process.env.OPENCODE_HOST || 'localhost',
  OPENCODE_PORT: parseInt(process.env.OPENCODE_PORT || '4096'),

  // ─── Kortix Backend ─────────────────────────────────────────────────────────
  // KORTIX_API_URL: base URL of kortix-api. Set by kortix-api at container creation.
  //   Inside Docker: http://host.docker.internal:8008 (or Docker DNS name).
  //   Fallback for native dev only.
  KORTIX_API_URL: process.env.KORTIX_API_URL || 'http://localhost:8008',

  // KORTIX_TOKEN — direction: sandbox → kortix-api.
  // This is how the sandbox authenticates itself TO kortix-api. Sent as
  // `Authorization: Bearer <KORTIX_TOKEN>` on outbound requests (cron, tunnel,
  // integrations, LLM proxy). Also used as the encryption key for SecretStore.
  // Created by kortix-api at sandbox provisioning time. Injected as Docker env var.
  get KORTIX_TOKEN() { return process.env.KORTIX_TOKEN || '' },

  // Secret storage
  SECRET_FILE_PATH: process.env.SECRET_FILE_PATH || '/workspace/.secrets/.secrets.json',
  SALT_FILE_PATH: process.env.SALT_FILE_PATH || '/workspace/.secrets/.salt',

  // Sandbox metadata
  SANDBOX_ID: process.env.SANDBOX_ID || '',
  PROJECT_ID: process.env.PROJECT_ID || '',

  // INTERNAL_SERVICE_KEY — direction: external → sandbox.
  // This is how kortix-api (and other external callers) authenticates TO the sandbox.
  // Every inbound request from outside the container must include this as a Bearer token.
  // Validated by the global auth middleware in index.ts.
  // Localhost requests (from inside the sandbox) bypass auth entirely — no token needed.
  // Counterpart: KORTIX_TOKEN goes the other direction (sandbox → kortix-api).
  // Auto-generates if not provided — external access is ALWAYS auth-protected.
  // In normal operation, kortix-api injects the key as a Docker env var.
  get INTERNAL_SERVICE_KEY(): string {
    if (!process.env.INTERNAL_SERVICE_KEY) {
      const { randomBytes } = require('crypto')
      const generated = randomBytes(32).toString('hex')
      process.env.INTERNAL_SERVICE_KEY = generated
      console.warn(
        '[Kortix Master] WARNING: No INTERNAL_SERVICE_KEY provided, auto-generated one.\n' +
        '  This sandbox is auth-protected. External callers must use this key:\n' +
        `  ${generated}\n` +
        '  Set INTERNAL_SERVICE_KEY env var to avoid this warning.'
      )
    }
    return process.env.INTERNAL_SERVICE_KEY
  },

  // Container-port → host-port mappings (set by docker-compose)
  PORT_MAP: parsePortMap(),
}
