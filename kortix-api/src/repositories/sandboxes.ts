/**
 * Sandbox repository.
 *
 * validateSandboxToken() has been removed — all token validation now goes
 * through validateSecretKey() in repositories/api-keys.ts using the unified
 * kortix.api_keys table. Both kortix_ (user) and kortix_sb_ (sandbox) keys
 * validate through the same path.
 */

// Re-export the unified validation so existing imports don't break during migration.
// Callers should migrate to importing directly from repositories/api-keys.
export { validateSecretKey as validateSandboxToken } from './api-keys';
export type { ApiKeyValidationResult as SandboxTokenResult } from './api-keys';
