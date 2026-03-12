import { Hono } from 'hono';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { releaseManifest } from '../../release';

/**
 * Sandbox version + changelog endpoint.
 *
 * Returns the version from release.json (baked into the Docker image).
 * CHANGELOG.json is read from the filesystem or fetched from GitHub.
 *
 * Update flow:
 *   1. Frontend GETs /v1/platform/sandbox/version → { version, changelog }
 *   2. Frontend GETs {sandboxUrl}/kortix/health → { version }
 *   3. Versions differ? Show "Update available"
 *   4. User clicks update → frontend POSTs /v1/platform/sandbox/update
 *   5. API pulls new Docker image, recreates container
 */

// CHANGELOG.json lookup paths (checked in order)
const LOCAL_CHANGELOG_PATHS = [
  resolve('/app/CHANGELOG.json'),
  resolve(process.cwd(), '../../packages/sandbox/CHANGELOG.json'),
  resolve(process.cwd(), '../packages/sandbox/CHANGELOG.json'),
  resolve(process.cwd(), 'packages/sandbox/CHANGELOG.json'),
];

// GitHub raw fallback
const CHANGELOG_GITHUB_URL = 'https://raw.githubusercontent.com/kortix-ai/computer/main/packages/sandbox/CHANGELOG.json';

// ─── Cache ──────────────────────────────────────────────────────────────────
let cachedChangelog: any[] | null = null;
let changelogCachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getVersion(): string {
  return process.env.SANDBOX_VERSION || config.SANDBOX_VERSION_OVERRIDE || releaseManifest.version;
}

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

  const local = readLocalChangelog();
  if (local) {
    cachedChangelog = local;
    changelogCachedAt = now;
    return local;
  }

  try {
    const headers: Record<string, string> = {};
    if (config.GITHUB_TOKEN) headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
    const res = await fetch(CHANGELOG_GITHUB_URL, { headers, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return cachedChangelog || [];
    cachedChangelog = await res.json() as any[];
    changelogCachedAt = now;
    return cachedChangelog;
  } catch {
    return cachedChangelog || [];
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const versionRouter = new Hono();

/**
 * GET /v1/platform/sandbox/version
 */
versionRouter.get('/', async (c) => {
  const version = getVersion();
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
