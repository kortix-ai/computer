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
  KORTIX_API_URL: process.env.KORTIX_API_URL || 'https://api.kortix.ai/v1/router',
  KORTIX_TOKEN: process.env.KORTIX_TOKEN || '',

  // Secret storage
  SECRET_FILE_PATH: process.env.SECRET_FILE_PATH || '/app/secrets/.secrets.json',
  SALT_FILE_PATH: process.env.SALT_FILE_PATH || '/app/secrets/.salt',

  // Sandbox metadata
  SANDBOX_ID: process.env.SANDBOX_ID || '',
  PROJECT_ID: process.env.PROJECT_ID || '',

  // Container-port → host-port mappings (set by docker-compose)
  PORT_MAP: parsePortMap(),
}
