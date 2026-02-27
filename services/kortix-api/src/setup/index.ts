/**
 * Setup routes — self-hosted instance management.
 *
 * Provides API endpoints for managing .env configuration and
 * system status after the initial wizard setup. Mounted at /v1/setup/*.
 *
 * Auth: All routes require Supabase JWT except /install-status (public).
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { config } from '../config';
import { ALL_SANDBOX_ENV_KEYS, toLegacySchema } from '../providers/registry';
import { supabaseAuth } from '../middleware/auth';

export const setupApp = new Hono<AppEnv>();

// ─── Auth ───────────────────────────────────────────────────────────────────
// All setup routes require Supabase JWT auth EXCEPT /install-status which must
// remain public (the installer/login page calls it before any user exists).
setupApp.use('/*', async (c, next) => {
  // Allow public routes without auth
  if (c.req.path.endsWith('/install-status') || c.req.path.endsWith('/sandbox-providers')) {
    return next();
  }
  // Everything else requires a valid Supabase JWT
  return supabaseAuth(c, next);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function findRepoRoot(): string | null {
  // Walk up from CWD looking for docker-compose.local.yml (repo/dev mode)
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
    resolve(__dirname, '../../../..'),
  ];

  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'docker-compose.local.yml'))) {
      return dir;
    }
  }

  return null;
}

function getProjectRoot(): string {
  return findRepoRoot() ?? process.cwd();
}

function getMasterUrlCandidates(): string[] {
  const candidates: string[] = [];
  const explicit = process.env.KORTIX_MASTER_URL;
  if (explicit && explicit.trim()) candidates.push(explicit.trim());

  // Inside docker-compose network, the sandbox service is reachable by name.
  candidates.push('http://sandbox:8000');

  // When running the API on the host (dev), sandbox is exposed on this port.
  candidates.push(`http://localhost:${config.SANDBOX_PORT_BASE || 14000}`);

  // De-dupe
  return Array.from(new Set(candidates));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMasterJson<T>(path: string, init: RequestInit = {}, timeoutMs = 5000): Promise<T> {
  const candidates = getMasterUrlCandidates();
  let lastErr: unknown = null;

  // Inject INTERNAL_SERVICE_KEY for sandbox auth (VPS mode)
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (serviceKey) {
    const existingHeaders = init.headers ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries()) : {};
    init = { ...init, headers: { ...existingHeaders, 'Authorization': `Bearer ${serviceKey}` } };
  }

  for (const base of candidates) {
    const url = `${base}${path}`;
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!res.ok) {
        lastErr = new Error(`Master ${url} returned ${res.status}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Failed to reach sandbox master');
}

async function getSandboxEnv(): Promise<Record<string, string>> {
  try {
    return await fetchMasterJson<Record<string, string>>('/env');
  } catch {
    return {};
  }
}

async function setSandboxEnv(keys: Record<string, string>): Promise<void> {
  await fetchMasterJson('/env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  }, 15000);
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

function maskKey(val: string): string {
  if (!val || val.length < 8) return val ? '****' : '';
  return val.slice(0, 4) + '...' + val.slice(-4);
}

function writeEnvFile(path: string, data: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const lines = existing.split('\n');
  const written = new Set<string>();
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      out.push(raw);
      continue;
    }
    const idx = line.indexOf('=');
    if (idx === -1) { out.push(raw); continue; }
    const key = line.slice(0, idx).trim();
    if (key in data) {
      out.push(`${key}=${data[key]}`);
      written.add(key);
    } else {
      out.push(raw);
    }
  }

  for (const [key, val] of Object.entries(data)) {
    if (!written.has(key)) {
      out.push(`${key}=${val}`);
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out.join('\n') + '\n');
}

// Use the shared provider registry instead of local constants.
// SANDBOX_KEYS is now ALL_SANDBOX_ENV_KEYS from the registry.
// KEY_SCHEMA is now generated by toLegacySchema() from the registry.

// Keys to check for onboarding status (not part of the UI schema)
const SYSTEM_KEYS = ['ONBOARDING_COMPLETE'];

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /v1/setup/install-status
 *
 * Public (no auth) — the installer/login page calls this before any user exists.
 * Returns whether the instance has been set up (i.e. an owner user exists).
 *
 * Response: { installed: boolean }
 *   installed=false → show "Create Owner Account" installer form
 *   installed=true  → show "Sign In" form
 */
setupApp.get('/install-status', async (c) => {
  try {
    // Use Supabase admin API to count users
    const supabaseUrl = config.SUPABASE_URL;
    const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      // Supabase not configured — treat as not installed
      return c.json({ installed: false });
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    if (!res.ok) {
      console.error(`[setup] install-status: Supabase admin API returned ${res.status}`);
      return c.json({ installed: false });
    }

    const data = await res.json();
    const hasUsers = Array.isArray(data.users) && data.users.length > 0;

    return c.json({ installed: hasUsers });
  } catch (err) {
    console.error('[setup] install-status error:', err);
    return c.json({ installed: false });
  }
});

/**
 * GET /v1/setup/sandbox-providers
 *
 * Public (no auth) — the installer wizard calls this to know which sandbox
 * providers are enabled so it can branch the setup flow accordingly.
 *
 * Response: { providers: string[], default: string }
 *   e.g. { providers: ["local_docker"], default: "local_docker" }
 *   e.g. { providers: ["daytona", "local_docker"], default: "daytona" }
 */
setupApp.get('/sandbox-providers', async (c) => {
  const available: string[] = [];
  if (config.isLocalDockerEnabled()) available.push('local_docker');
  if (config.isDaytonaEnabled()) available.push('daytona');

  return c.json({
    providers: available,
    default: available[0] || 'local_docker',
  });
});

/**
 * GET /v1/setup/status
 * System status — Docker, .env files, services
 */
setupApp.get('/status', async (c) => {
  const root = getProjectRoot();
  const envExists = existsSync(resolve(root, '.env'));
  const sandboxEnvExists = existsSync(resolve(root, 'sandbox/.env'));

  let dockerRunning = false;
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 10000 });
    dockerRunning = true;
  } catch {}

  return c.json({
    envMode: config.ENV_MODE,
    dockerRunning,
    envExists,
    sandboxEnvExists,
    projectRoot: root,
  });
});

/**
 * GET /v1/setup/schema
 * Key schema for the UI
 */
setupApp.get('/schema', async (c) => {
  return c.json(toLegacySchema());
});

/**
 * GET /v1/setup/env
 * Read current .env values (masked)
 */
setupApp.get('/env', async (c) => {
  const repoRoot = findRepoRoot();

  // Repo/dev mode: reads and writes actual .env files in the repo.
  if (repoRoot) {
    const rootEnv = parseEnvFile(resolve(repoRoot, '.env'));
    const sandboxEnv = parseEnvFile(resolve(repoRoot, 'sandbox/.env'));

    const masked: Record<string, string> = {};
    const configured: Record<string, boolean> = {};

    const legacySchema = toLegacySchema();
    for (const group of Object.values(legacySchema)) {
      for (const k of group.keys) {
        const val = rootEnv[k.key] || sandboxEnv[k.key] || '';
        masked[k.key] = maskKey(val);
        configured[k.key] = !!val;
      }
    }

    for (const key of SYSTEM_KEYS) {
      const val = rootEnv[key] || sandboxEnv[key] || '';
      configured[key] = val === 'true';
    }

    return c.json({ masked, configured });
  }

  // Installed/local Docker mode: proxy to sandbox secret store.
  const env = await getSandboxEnv();
  const masked: Record<string, string> = {};
  const configured: Record<string, boolean> = {};

  const legacySchema = toLegacySchema();
  for (const group of Object.values(legacySchema)) {
    for (const k of group.keys) {
      const val = env[k.key] || '';
      masked[k.key] = maskKey(val);
      configured[k.key] = !!val;
    }
  }

  for (const key of SYSTEM_KEYS) {
    const val = env[key] || '';
    configured[key] = val === 'true';
  }

  return c.json({ masked, configured });
});

/**
 * POST /v1/setup/env
 * Save/update API keys
 */
setupApp.post('/env', async (c) => {
  const body = await c.req.json();
  const keys = body?.keys;
  if (!keys || typeof keys !== 'object') {
    return c.json({ error: 'Invalid keys' }, 400);
  }

  const repoRoot = findRepoRoot();

  // Installed/local Docker mode: persist keys in the sandbox secret store.
    // Tools pick up new values instantly via s6 env dir (no restart needed).
  if (!repoRoot) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) {
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      clean[k] = trimmed;
    }

    try {
      await setSandboxEnv(clean);
      return c.json({ ok: true });
    } catch (e: any) {
      return c.json(
        { ok: false, error: 'Failed to save configuration', details: e?.message || String(e) },
        500,
      );
    }
  }

  // Repo/dev mode: write keys into repo .env + sandbox/.env and generate per-service env files.
  const root = repoRoot;
  const rootData: Record<string, string> = {};
  const sandboxData: Record<string, string> = {};

  for (const [key, val] of Object.entries(keys)) {
    if (typeof val !== 'string') continue;
    rootData[key] = val;
    if (ALL_SANDBOX_ENV_KEYS.has(key)) {
      sandboxData[key] = val;
    }
  }

  // Ensure root .env exists
  const rootEnvPath = resolve(root, '.env');
  if (!existsSync(rootEnvPath)) {
    const examplePath = resolve(root, '.env.example');
    if (existsSync(examplePath)) {
      writeFileSync(rootEnvPath, readFileSync(examplePath, 'utf-8'));
    } else {
      writeFileSync(rootEnvPath, '# Kortix Environment Configuration\nENV_MODE=local\n');
    }
  }

  rootData.ENV_MODE = 'local';
  rootData.ALLOWED_SANDBOX_PROVIDERS = 'local_docker';
  writeEnvFile(rootEnvPath, rootData);

  // Sandbox .env
  const sandboxEnvPath = resolve(root, 'sandbox/.env');
  if (!existsSync(sandboxEnvPath)) {
    const examplePath = resolve(root, 'sandbox/.env.example');
    if (existsSync(examplePath)) {
      writeFileSync(sandboxEnvPath, readFileSync(examplePath, 'utf-8'));
    } else {
      writeFileSync(sandboxEnvPath, '# Kortix Sandbox Environment\nENV_MODE=local\n');
    }
  }
  sandboxData.ENV_MODE = 'local';
  sandboxData.SANDBOX_ID = 'kortix-sandbox';
  sandboxData.PROJECT_ID = 'local';
  sandboxData.KORTIX_API_URL = 'http://kortix-api:8008';
  writeEnvFile(sandboxEnvPath, sandboxData);

  // Run setup-env.sh
  try {
    execSync('bash scripts/setup-env.sh', { cwd: root, stdio: 'pipe', timeout: 15000 });
  } catch (e: any) {
    console.error('[setup] setup-env.sh failed:', e.message);
  }

  return c.json({ ok: true });
});

/**
 * GET /v1/setup/health
 * Health check of all local services
 */
setupApp.get('/health', async (c) => {
  const repoRoot = findRepoRoot();
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // Check API (self)
  checks.api = { ok: true };

  // Installed/local Docker mode: check sandbox by HTTP (no docker CLI in image)
  if (!repoRoot) {
    try {
      await fetchMasterJson('/kortix/health', {}, 5000);
      checks.sandbox = { ok: true };
      checks.docker = { ok: true };
    } catch (e: any) {
      const msg = e?.message || String(e);
      checks.sandbox = { ok: false, error: msg };
      checks.docker = { ok: false, error: msg };
    }
    return c.json(checks);
  }

  // Check Docker
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 5000 });
    checks.docker = { ok: true };
  } catch {
    checks.docker = { ok: false, error: 'Docker not running' };
  }

  // Check sandbox container
  try {
    const out = execSync('docker inspect kortix-sandbox --format "{{.State.Status}}"', {
      stdio: 'pipe',
      timeout: 5000,
    }).toString().trim();
    checks.sandbox = { ok: out === 'running', error: out !== 'running' ? `Status: ${out}` : undefined };
  } catch {
    checks.sandbox = { ok: false, error: 'Container not found' };
  }

  return c.json(checks);
});

/**
 * Helper: read all onboarding env keys from repo .env or sandbox secret store.
 */
async function getOnboardingEnv(): Promise<Record<string, string>> {
  const repoRoot = findRepoRoot();
  if (repoRoot) {
    const rootEnv = parseEnvFile(resolve(repoRoot, '.env'));
    // Also check sandbox as fallback (onboarding tool writes there)
    if (rootEnv['ONBOARDING_COMPLETE'] !== 'true') {
      try {
        const sandboxEnv = await getSandboxEnv();
        if (sandboxEnv['ONBOARDING_COMPLETE'] === 'true') {
          // Sync back to repo .env
          const sync: Record<string, string> = { ONBOARDING_COMPLETE: 'true' };
          if (sandboxEnv['ONBOARDING_SESSION_ID']) sync['ONBOARDING_SESSION_ID'] = sandboxEnv['ONBOARDING_SESSION_ID'];
          writeEnvFile(resolve(repoRoot, '.env'), sync);
          return { ...rootEnv, ...sandboxEnv };
        }
      } catch {
        // Sandbox not reachable
      }
    }
    return rootEnv;
  }
  // Docker/installed mode
  return getSandboxEnv();
}

/**
 * Helper: write onboarding env keys to repo .env or sandbox secret store.
 */
async function setOnboardingEnv(entries: Record<string, string>): Promise<boolean> {
  const repoRoot = findRepoRoot();
  if (repoRoot) {
    writeEnvFile(resolve(repoRoot, '.env'), entries);
    return true;
  }
  try {
    await setSandboxEnv(entries);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /v1/setup/onboarding-status
 * Returns { complete, session_id? } — the frontend uses session_id to resume
 * an existing onboarding session instead of creating a new one.
 */
setupApp.get('/onboarding-status', async (c) => {
  try {
    const env = await getOnboardingEnv();
    const complete = env['ONBOARDING_COMPLETE'] === 'true';
    const sessionId = env['ONBOARDING_SESSION_ID'] || null;
    return c.json({ complete, session_id: sessionId });
  } catch {
    return c.json({ complete: false, session_id: null });
  }
});

/**
 * POST /v1/setup/onboarding-session
 * Store the onboarding session ID so it persists across page reloads.
 * Called by the frontend when it creates the onboarding session.
 * Body: { session_id: string }
 */
setupApp.post('/onboarding-session', async (c) => {
  try {
    const body = await c.req.json<{ session_id: string }>();
    if (!body.session_id) return c.json({ ok: false, error: 'Missing session_id' }, 400);
    const ok = await setOnboardingEnv({ ONBOARDING_SESSION_ID: body.session_id });
    return ok ? c.json({ ok: true }) : c.json({ ok: false, error: 'Failed to persist' }, 500);
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

/**
 * POST /v1/setup/onboarding-complete
 * Mark onboarding as complete (called by the onboarding tool or frontend).
 * Optionally accepts { session_id } in body to store it alongside completion.
 */
setupApp.post('/onboarding-complete', async (c) => {
  try {
    const entries: Record<string, string> = { ONBOARDING_COMPLETE: 'true' };
    try {
      const body = await c.req.json<{ session_id?: string }>();
      if (body?.session_id) entries['ONBOARDING_SESSION_ID'] = body.session_id;
    } catch {
      // No body or invalid JSON — that's fine, just mark complete
    }
    const ok = await setOnboardingEnv(entries);
    return ok ? c.json({ ok: true }) : c.json({ ok: false, error: 'Failed to persist' }, 500);
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
