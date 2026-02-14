import { Hono } from 'hono';

/**
 * Sandbox version endpoint.
 *
 * Checks the npm registry for the latest published version of @kortix/sandbox.
 * This is the ONLY source of truth — no hardcoded versions anywhere.
 *
 * The full update flow:
 *
 * DEVELOPER SIDE (pushing an update):
 *   1. Change code in sandbox/opencode/, sandbox/kortix-master/, etc.
 *   2. Bump "version" in sandbox/package.json (the ONLY place)
 *   3. npm publish from sandbox/  →  @kortix/sandbox@X.Y.Z lands on npm
 *   4. Done. Platform auto-detects. No deploy needed for version bump.
 *
 * CLIENT SIDE (frontend triggering update):
 *   1. Frontend GETs /v1/sandbox/version  →  { version: "0.4.2" }
 *   2. Frontend GETs {sandboxUrl}/kortix/update/status  →  { version: "0.4.1" }
 *   3. Versions differ? Show "Update available" to user
 *   4. User clicks update → frontend GETs {sandboxUrl}/kortix/update
 *   5. Sandbox runs `npm install -g @kortix/sandbox@0.4.2`, restarts services
 *   6. Frontend polls /kortix/update/status until done
 */

const NPM_PACKAGE = '@kortix/sandbox';
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;

// ─── Cache ──────────────────────────────────────────────────────────────────
// Cache the npm lookup for 5 minutes so we're not hammering the registry
// on every sandbox check. In practice, hundreds of sandboxes may hit this
// endpoint within the same hour.

let cachedVersion: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getLatestVersion(): Promise<string> {
  // Dev override: set SANDBOX_VERSION env var to skip npm registry lookup.
  // Useful for local testing before the package is published.
  //   SANDBOX_VERSION=0.4.2 bun run src/index.ts
  const override = process.env.SANDBOX_VERSION;
  if (override) return override;

  const now = Date.now();

  if (cachedVersion && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedVersion;
  }

  try {
    const res = await fetch(NPM_REGISTRY_URL, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      console.error(`[Version] npm registry returned ${res.status}`);
      return cachedVersion || '0.0.0';
    }

    const data = await res.json() as { version: string };
    cachedVersion = data.version;
    cachedAt = now;
    return data.version;
  } catch (e) {
    console.error('[Version] Failed to fetch from npm registry:', e);
    return cachedVersion || '0.0.0';
  }
}

// ─── Route ──────────────────────────────────────────────────────────────────

const versionRouter = new Hono();

/**
 * GET /v1/platform/sandbox/version
 *
 * Returns the latest published version of @kortix/sandbox from npm.
 * Called by:
 *   - Each sandbox's kortix-master (to check if it needs to update)
 *   - Frontend (to compare against sandbox's current version)
 */
versionRouter.get('/', async (c) => {
  const version = await getLatestVersion();

  return c.json({
    version,
    package: NPM_PACKAGE,
  });
});

export { versionRouter };
