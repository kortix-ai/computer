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

  // Kortix backend
  KORTIX_API_URL: process.env.KORTIX_API_URL || 'http://localhost:8008/v1/router',
  get KORTIX_TOKEN() { return process.env.KORTIX_TOKEN || '' },

  // Secret storage
  SECRET_FILE_PATH: process.env.SECRET_FILE_PATH || '/workspace/.secrets/.secrets.json',
  SALT_FILE_PATH: process.env.SALT_FILE_PATH || '/workspace/.secrets/.salt',

  // Sandbox metadata
  SANDBOX_ID: process.env.SANDBOX_ID || '',
  PROJECT_ID: process.env.PROJECT_ID || '',

  // Security: internal service-to-service auth.
  // Auto-generates a key if none provided — the sandbox is ALWAYS auth-protected.
  // In normal operation, kortix-api injects the key as an env var during container creation.
  // Auto-generation is a safety net for manual/standalone runs (key is logged once at boot).
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
