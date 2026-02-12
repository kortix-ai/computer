/**
 * Generate a cryptographically secure sandbox-scoped auth token.
 * Format: sbt_<48 random chars> (sandbox token)
 */
export function generateSandboxToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return `sbt_${result}`;
}
