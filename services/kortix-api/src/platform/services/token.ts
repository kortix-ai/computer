/**
 * @deprecated Sandbox tokens (sbt_) have been replaced by kortix_sb_ keys
 * stored in the api_keys table. Use generateSandboxKeyPair() from shared/crypto.ts instead.
 *
 * This file is kept temporarily for any lingering imports — it re-exports
 * the new function so callers don't break.
 */
export { generateSandboxKeyPair as generateSandboxToken } from '../../shared/crypto';
