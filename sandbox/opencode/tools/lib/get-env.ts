import { readFileSync } from "fs";

const S6_ENV_DIR =
  process.env.S6_ENV_DIR || "/run/s6/container_environment";

/**
 * Read an environment variable with hot-reload support.
 *
 * 1. Fast path — return from `process.env` (in-memory, zero cost).
 * 2. Fallback  — read from the s6 per-key env directory (tmpfs, sub-ms).
 *    The Kortix Master `/env` API always writes here, so this picks up
 *    newly-set keys *without* an OpenCode restart.
 * 3. Cache     — on a successful s6 read the value is written back to
 *    `process.env` so every subsequent call in the same process is free.
 */
export function getEnv(key: string): string | undefined {
  const cached = process.env[key];
  if (cached) return cached;

  try {
    const val = readFileSync(`${S6_ENV_DIR}/${key}`, "utf-8").trim();
    if (val) {
      process.env[key] = val; // cache for the lifetime of this process
      return val;
    }
  } catch {
    // File doesn't exist or isn't readable — key genuinely not set.
  }

  return undefined;
}
