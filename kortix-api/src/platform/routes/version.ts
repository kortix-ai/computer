import { Hono } from 'hono';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { releaseManifest } from '../../release';

/**
 * Sandbox version + changelog endpoint.
 *
 * Returns the exact sandbox release targeted by this API deployment.
 * Loads CHANGELOG.json with a priority chain:
 *   1. Local filesystem (bundled in Docker image or sandbox npm package)
 *   2. GitHub raw (fallback, requires public repo or token)
 *
 * The full update flow:
 *
 * DEVELOPER SIDE (pushing an update):
 *   1. Add entry to packages/sandbox/CHANGELOG.json
 *   2. Run ./scripts/release/sandbox/release.sh X.Y.Z
 *   3. Script bumps versions, publishes CLI/SDK/sandbox, creates GitHub release
 *   4. Deploy the matching API/frontend images.
 *   5. Running sandboxes show "Update available" when they lag behind the API target release.
 *
 * CLIENT SIDE (frontend triggering update):
 *   1. Frontend GETs /v1/platform/sandbox/version  →  { version, changelog }
 *   2. Frontend GETs {sandboxUrl}/kortix/health  →  { version: "0.4.1" }
 *   3. Versions differ? Show "Update available" with changelog preview
 *   4. User clicks update → frontend POSTs {sandboxUrl}/kortix/update
 *   5. Sandbox runs `npm install -g @kortix/sandbox@X.Y.Z`, restarts services
 */

const NPM_PACKAGE = releaseManifest.sandbox.package.name;

// Local filesystem paths where CHANGELOG.json might live (checked in order).
// - Docker API image: /app/CHANGELOG.json (COPYed in Dockerfile)
// - Sandbox global npm: /usr/lib/node_modules/@kortix/sandbox/CHANGELOG.json
// - Sandbox global npm (alt): /usr/local/lib/node_modules/@kortix/sandbox/CHANGELOG.json
// - Local dev: CWD is computer/kortix-api/, repo root is ../../
const LOCAL_CHANGELOG_PATHS = [
  resolve('/app/CHANGELOG.json'),
  resolve('/usr/lib/node_modules/@kortix/sandbox/CHANGELOG.json'),
  resolve('/usr/local/lib/node_modules/@kortix/sandbox/CHANGELOG.json'),
  resolve(process.cwd(), '../../packages/sandbox/CHANGELOG.json'),
];

// GitHub raw fallback (only works for public repos or with GITHUB_TOKEN)
const CHANGELOG_GITHUB_URL = 'https://raw.githubusercontent.com/kortix-ai/computer/main/packages/sandbox/CHANGELOG.json';

// ─── Cache ──────────────────────────────────────────────────────────────────
// Cache lookups for 5 minutes so we're not hammering registries.
// In practice, hundreds of sandboxes may hit this endpoint in the same hour.

let cachedVersion: string | null = null;
let cachedAt = 0;
let cachedChangelog: any[] | null = null;
let changelogCachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getLatestVersion(): Promise<string> {
  // Dev/self-hosted override: allow forcing a target release explicitly.
  const override = process.env.SANDBOX_VERSION || config.SANDBOX_VERSION_OVERRIDE;
  if (override) return override;

  const now = Date.now();
  if (cachedVersion && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedVersion;
  }

  cachedVersion = releaseManifest.sandbox.package.version;
  cachedAt = now;
  return cachedVersion;
}

/**
 * Try reading CHANGELOG.json from the local filesystem.
 * Returns null if not found at any known path.
 */
function readLocalChangelog(): any[] | null {
  for (const p of LOCAL_CHANGELOG_PATHS) {
    try {
      if (existsSync(p)) {
        const data = JSON.parse(readFileSync(p, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch {
      // ignore and try next path
    }
  }
  return null;
}

/**
 * Load changelog with priority: local filesystem → GitHub raw → cache → empty.
 */
async function getChangelog(): Promise<any[]> {
  const now = Date.now();
  if (cachedChangelog && (now - changelogCachedAt) < CACHE_TTL_MS) {
    return cachedChangelog;
  }

  // 1. Try local filesystem first (works in Docker image and sandbox)
  const local = readLocalChangelog();
  if (local) {
    cachedChangelog = local;
    changelogCachedAt = now;
    return local;
  }

  // 2. Fall back to GitHub raw (works for public repos)
  try {
    const headers: Record<string, string> = {};
    if (config.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
    }

    const res = await fetch(CHANGELOG_GITHUB_URL, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`[Version] GitHub changelog returned ${res.status}`);
      return cachedChangelog || [];
    }
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
 * Returns the target sandbox version + changelog entry for this deployment.
 */
versionRouter.get('/', async (c) => {
  const version = await getLatestVersion();
  const changelog = await getChangelog();
  const entry = changelog.find((e: any) => e.version === version) ?? null;

  return c.json({
    version,
    package: NPM_PACKAGE,
    channel: releaseManifest.channel,
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
