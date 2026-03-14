import { Hono } from 'hono';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { releaseManifest } from '../../release';

/**
 * Sandbox version + changelog endpoint.
 *
 * Update flow:
 *   1. Frontend GETs /v1/platform/sandbox/version/latest → { version, channel } from GitHub
 *   2. Frontend GETs {sandboxUrl}/kortix/health → { version } (current running version)
 *   3. Versions differ? Show "Update available"
 *   4. User clicks update → frontend POSTs /v1/platform/sandbox/update
 *   5. API pulls new Docker image, recreates container
 *
 * The "latest" version is always fetched from GitHub raw release.json — never
 * from the local baked-in release.json — so users always see the true latest
 * regardless of which API version they are running.
 */

// GitHub raw URLs — single source of truth for latest version
const RELEASE_GITHUB_URL = 'https://raw.githubusercontent.com/kortix-ai/computer/main/sandbox/release.json';
const CHANGELOG_GITHUB_URL = 'https://raw.githubusercontent.com/kortix-ai/computer/main/sandbox/CHANGELOG.json';

// Local CHANGELOG.json lookup paths (checked as fallback)
const LOCAL_CHANGELOG_PATHS = [
  resolve('/app/CHANGELOG.json'),
  resolve(process.cwd(), '../../sandbox/CHANGELOG.json'),
  resolve(process.cwd(), '../sandbox/CHANGELOG.json'),
  resolve(process.cwd(), 'sandbox/CHANGELOG.json'),
];

// ─── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedLatestRelease: { version: string; channel: string } | null = null;
let latestReleaseCachedAt = 0;

let cachedChangelog: any[] | null = null;
let changelogCachedAt = 0;

// ─── Latest release from GitHub ─────────────────────────────────────────────

async function getLatestRelease(): Promise<{ version: string; channel: string }> {
  const now = Date.now();
  if (cachedLatestRelease && (now - latestReleaseCachedAt) < CACHE_TTL_MS) {
    return cachedLatestRelease;
  }

  try {
    const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
    if (config.GITHUB_TOKEN) headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
    const res = await fetch(RELEASE_GITHUB_URL, { headers, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`GitHub release fetch failed: ${res.status}`);
    const data = await res.json() as any;
    cachedLatestRelease = { version: data.version, channel: data.channel ?? 'stable' };
    latestReleaseCachedAt = now;
    return cachedLatestRelease;
  } catch (err) {
    console.warn('[version] Failed to fetch latest release from GitHub:', err);
    // Fall back to local so we never return nothing
    return { version: releaseManifest.version, channel: releaseManifest.channel };
  }
}

// ─── Changelog ──────────────────────────────────────────────────────────────

function readLocalChangelog(): any[] | null {
  for (const p of LOCAL_CHANGELOG_PATHS) {
    try {
      if (existsSync(p)) {
        const data = JSON.parse(readFileSync(p, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function getChangelog(): Promise<any[]> {
  const now = Date.now();
  if (cachedChangelog && (now - changelogCachedAt) < CACHE_TTL_MS) {
    return cachedChangelog;
  }

  // Always prefer GitHub so changelog stays in sync with latest release
  try {
    const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
    if (config.GITHUB_TOKEN) headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
    const res = await fetch(CHANGELOG_GITHUB_URL, { headers, signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      cachedChangelog = await res.json() as any[];
      changelogCachedAt = now;
      return cachedChangelog;
    }
  } catch {
    // fall through to local
  }

  const local = readLocalChangelog();
  if (local) {
    cachedChangelog = local;
    changelogCachedAt = now;
    return local;
  }

  return cachedChangelog || [];
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const versionRouter = new Hono();

/**
 * GET /v1/platform/sandbox/version/latest
 * Returns the true latest published version from GitHub — always current.
 * This is what the frontend uses for update checks.
 */
versionRouter.get('/latest', async (c) => {
  const latest = await getLatestRelease();
  const changelog = await getChangelog();
  const entry = changelog.find((e: any) => e.version === latest.version) ?? null;
  return c.json({ version: latest.version, channel: latest.channel, changelog: entry });
});

/**
 * GET /v1/platform/sandbox/version
 * Returns the version baked into this running API image.
 */
versionRouter.get('/', async (c) => {
  const version = process.env.SANDBOX_VERSION || config.SANDBOX_VERSION_OVERRIDE || releaseManifest.version;
  const changelog = await getChangelog();
  const entry = changelog.find((e: any) => e.version === version) ?? null;
  return c.json({ version, channel: releaseManifest.channel, changelog: entry });
});

/**
 * GET /v1/platform/sandbox/version/changelog
 */
versionRouter.get('/changelog', async (c) => {
  const changelog = await getChangelog();
  return c.json({ changelog });
});

export { versionRouter };
