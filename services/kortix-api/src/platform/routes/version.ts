import { Hono } from 'hono';

/**
 * Sandbox version + changelog endpoint.
 *
 * Checks the npm registry for the latest published version of @kortix/sandbox.
 * Fetches CHANGELOG.json from GitHub for release notes.
 *
 * The full update flow:
 *
 * DEVELOPER SIDE (pushing an update):
 *   1. Add entry to sandbox/CHANGELOG.json
 *   2. Run ./sandbox/release.sh X.Y.Z
 *   3. Script bumps versions, publishes CLI/SDK/sandbox, creates GitHub release
 *   4. Done. Platform auto-detects. Running sandboxes show "Update available".
 *
 * CLIENT SIDE (frontend triggering update):
 *   1. Frontend GETs /v1/platform/sandbox/version  →  { version, changelog }
 *   2. Frontend GETs {sandboxUrl}/kortix/health  →  { version: "0.4.1" }
 *   3. Versions differ? Show "Update available" with changelog preview
 *   4. User clicks update → frontend POSTs {sandboxUrl}/kortix/update
 *   5. Sandbox runs `npm install -g @kortix/sandbox@X.Y.Z`, restarts services
 */

const NPM_PACKAGE = '@kortix/sandbox';
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;
const CHANGELOG_URL = 'https://raw.githubusercontent.com/kortix-ai/computer/main/sandbox/CHANGELOG.json';

// ─── Cache ──────────────────────────────────────────────────────────────────
// Cache lookups for 5 minutes so we're not hammering registries.
// In practice, hundreds of sandboxes may hit this endpoint in the same hour.

let cachedVersion: string | null = null;
let cachedAt = 0;
let cachedChangelog: any[] | null = null;
let changelogCachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getLatestVersion(): Promise<string> {
  // Dev override: set SANDBOX_VERSION env var to skip npm registry lookup.
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

async function getChangelog(): Promise<any[]> {
  const now = Date.now();
  if (cachedChangelog && (now - changelogCachedAt) < CACHE_TTL_MS) {
    return cachedChangelog;
  }

  try {
    const res = await fetch(CHANGELOG_URL, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return cachedChangelog || [];
    cachedChangelog = await res.json() as any[];
    changelogCachedAt = now;
    return cachedChangelog;
  } catch (e) {
    console.error('[Version] Failed to fetch changelog:', e);
    return cachedChangelog || [];
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const versionRouter = new Hono();

/**
 * GET /v1/platform/sandbox/version
 *
 * Returns the latest published version + changelog entry.
 */
versionRouter.get('/', async (c) => {
  const version = await getLatestVersion();
  const changelog = await getChangelog();
  const entry = changelog.find((e: any) => e.version === version) ?? null;

  return c.json({
    version,
    package: NPM_PACKAGE,
    changelog: entry,
  });
});

/**
 * GET /v1/platform/sandbox/version/changelog
 *
 * Returns the full changelog history.
 */
versionRouter.get('/changelog', async (c) => {
  const changelog = await getChangelog();
  return c.json({ changelog });
});

export { versionRouter };
