/**
 * Admin Panel — self-contained admin dashboard served by kortix-api.
 *
 * Serves an embedded HTML admin UI at /v1/admin and exposes JSON API endpoints
 * for managing platform-level .env credentials and listing all sandbox instances.
 *
 * Auth: Supabase JWT (same as other authenticated routes).
 *
 * Routes:
 *   GET  /v1/admin                → Admin panel HTML (single-page app)
 *   GET  /v1/admin/api/env        → Read current env values (masked)
 *   POST /v1/admin/api/env        → Update env values
 *   GET  /v1/admin/api/schema     → Provider key schema
 *   GET  /v1/admin/api/instances  → List all sandbox instances
 *   GET  /v1/admin/api/health     → Service health checks
 *   GET  /v1/admin/api/status     → System status
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import type { AppEnv } from '../types';
import { config } from '../config';
import { PROVIDER_REGISTRY, toLegacySchema, LLM_PROVIDERS, TOOL_PROVIDERS } from '../providers/registry';
import { supabaseAuth } from '../middleware/auth';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { execSync } from 'child_process';

export const adminApp = new Hono<AppEnv>();

// ─── Auth ───────────────────────────────────────────────────────────────────
// All admin routes require Supabase JWT auth.
adminApp.use('/*', supabaseAuth);

// ─── Helpers (reused from setup module) ─────────────────────────────────────

function findRepoRoot(): string | null {
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

function getMasterUrlCandidates(): string[] {
  const candidates: string[] = [];
  const explicit = process.env.KORTIX_MASTER_URL;
  if (explicit && explicit.trim()) candidates.push(explicit.trim());
  candidates.push('http://sandbox:8000');
  candidates.push(`http://localhost:${config.SANDBOX_PORT_BASE || 14000}`);
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
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (serviceKey) {
    const existingHeaders = init.headers ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries()) : {};
    init = { ...init, headers: { ...existingHeaders, 'Authorization': `Bearer ${serviceKey}` } };
  }
  for (const base of candidates) {
    const url = `${base}${path}`;
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!res.ok) { lastErr = new Error(`Master ${url} returned ${res.status}`); continue; }
      return (await res.json()) as T;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to reach sandbox master');
}

async function getSandboxEnv(): Promise<Record<string, string>> {
  try { return await fetchMasterJson<Record<string, string>>('/env'); }
  catch { return {}; }
}

async function setSandboxEnv(keys: Record<string, string>): Promise<void> {
  await fetchMasterJson('/env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  }, 15000);
}

// ─── Extended key groups (beyond provider registry) ─────────────────────────
// These are platform-level keys not in the provider registry but configured
// during get-kortix.sh setup.

interface KeyGroup {
  title: string;
  description: string;
  keys: Array<{ key: string; label: string; helpUrl?: string; secret?: boolean }>;
}

function getAdminKeySchema(): Record<string, KeyGroup> {
  const schema = toLegacySchema();

  // Add platform-level key groups not in the provider registry
  return {
    ...schema,
    billing: {
      title: 'Billing',
      description: 'Stripe and RevenueCat keys for subscription billing.',
      keys: [
        { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', secret: true },
        { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', secret: true },
        { key: 'REVENUECAT_API_KEY', label: 'RevenueCat API Key', secret: true },
        { key: 'REVENUECAT_WEBHOOK_SECRET', label: 'RevenueCat Webhook Secret', secret: true },
      ],
    },
    cloud: {
      title: 'Cloud Provider',
      description: 'Daytona cloud sandbox provisioning.',
      keys: [
        { key: 'DAYTONA_API_KEY', label: 'Daytona API Key', secret: true },
        { key: 'DAYTONA_SERVER_URL', label: 'Daytona Server URL' },
        { key: 'DAYTONA_TARGET', label: 'Daytona Target' },
      ],
    },
    sandbox: {
      title: 'Sandbox Configuration',
      description: 'Local sandbox provisioning settings.',
      keys: [
        { key: 'ALLOWED_SANDBOX_PROVIDERS', label: 'Allowed Providers' },
        { key: 'SANDBOX_PORT_BASE', label: 'Sandbox Port Base' },
        { key: 'DOCKER_HOST', label: 'Docker Host' },
        { key: 'INTERNAL_SERVICE_KEY', label: 'Internal Service Key', secret: true },
      ],
    },
    scheduler: {
      title: 'Scheduler',
      description: 'Cron trigger configuration.',
      keys: [
        { key: 'SCHEDULER_ENABLED', label: 'Scheduler Enabled' },
        { key: 'CRON_TICK_SECRET', label: 'Cron Tick Secret', secret: true },
        { key: 'CRON_API_URL', label: 'Cron API URL' },
      ],
    },
    integrations: {
      title: 'Integrations',
      description: 'Pipedream and Slack OAuth integration keys.',
      keys: [
        { key: 'PIPEDREAM_CLIENT_ID', label: 'Pipedream Client ID' },
        { key: 'PIPEDREAM_CLIENT_SECRET', label: 'Pipedream Client Secret', secret: true },
        { key: 'PIPEDREAM_PROJECT_ID', label: 'Pipedream Project ID' },
        { key: 'SLACK_CLIENT_ID', label: 'Slack Client ID' },
        { key: 'SLACK_CLIENT_SECRET', label: 'Slack Client Secret', secret: true },
        { key: 'SLACK_SIGNING_SECRET', label: 'Slack Signing Secret', secret: true },
      ],
    },
    core: {
      title: 'Core Infrastructure',
      description: 'Database, Supabase, and API security keys.',
      keys: [
        { key: 'DATABASE_URL', label: 'Database URL', secret: true },
        { key: 'SUPABASE_URL', label: 'Supabase URL' },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase Service Role Key', secret: true },
        { key: 'API_KEY_SECRET', label: 'API Key Hashing Secret', secret: true },
      ],
    },
  };
}

// Collect all admin-managed keys
function getAllAdminKeys(): string[] {
  const schema = getAdminKeySchema();
  const keys: string[] = [];
  for (const group of Object.values(schema)) {
    for (const k of group.keys) {
      keys.push(k.key);
    }
  }
  return keys;
}

// ─── API Routes ─────────────────────────────────────────────────────────────

/** GET /v1/admin/api/schema — key schema for the UI */
adminApp.get('/api/schema', async (c) => {
  return c.json(getAdminKeySchema());
});

/** GET /v1/admin/api/env — read current env values (masked) */
adminApp.get('/api/env', async (c) => {
  const repoRoot = findRepoRoot();
  const allKeys = getAllAdminKeys();

  if (repoRoot) {
    const rootEnv = parseEnvFile(resolve(repoRoot, '.env'));
    const sandboxEnv = parseEnvFile(resolve(repoRoot, 'sandbox/.env'));
    const masked: Record<string, string> = {};
    const configured: Record<string, boolean> = {};

    for (const key of allKeys) {
      const val = rootEnv[key] || sandboxEnv[key] || '';
      masked[key] = maskKey(val);
      configured[key] = !!val;
    }
    return c.json({ masked, configured });
  }

  // Docker mode
  const env = await getSandboxEnv();
  const masked: Record<string, string> = {};
  const configured: Record<string, boolean> = {};
  for (const key of allKeys) {
    const val = env[key] || '';
    masked[key] = maskKey(val);
    configured[key] = !!val;
  }
  return c.json({ masked, configured });
});

/** POST /v1/admin/api/env — save/update env values */
adminApp.post('/api/env', async (c) => {
  const body = await c.req.json();
  const keys = body?.keys;
  if (!keys || typeof keys !== 'object') {
    return c.json({ error: 'Invalid keys' }, 400);
  }

  const repoRoot = findRepoRoot();

  if (!repoRoot) {
    // Docker mode
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
      return c.json({ ok: false, error: 'Failed to save', details: e?.message || String(e) }, 500);
    }
  }

  // Repo mode
  const rootData: Record<string, string> = {};
  const sandboxData: Record<string, string> = {};
  const { ALL_SANDBOX_ENV_KEYS } = await import('../providers/registry');

  for (const [key, val] of Object.entries(keys)) {
    if (typeof val !== 'string') continue;
    rootData[key] = val;
    if (ALL_SANDBOX_ENV_KEYS.has(key)) {
      sandboxData[key] = val;
    }
  }

  const rootEnvPath = resolve(repoRoot, '.env');
  if (!existsSync(rootEnvPath)) {
    const examplePath = resolve(repoRoot, '.env.example');
    if (existsSync(examplePath)) {
      writeFileSync(rootEnvPath, readFileSync(examplePath, 'utf-8'));
    } else {
      writeFileSync(rootEnvPath, '# Kortix Environment Configuration\nENV_MODE=local\n');
    }
  }

  writeEnvFile(rootEnvPath, rootData);

  if (Object.keys(sandboxData).length > 0) {
    const sandboxEnvPath = resolve(repoRoot, 'sandbox/.env');
    if (!existsSync(sandboxEnvPath)) {
      const examplePath = resolve(repoRoot, 'sandbox/.env.example');
      if (existsSync(examplePath)) {
        writeFileSync(sandboxEnvPath, readFileSync(examplePath, 'utf-8'));
      } else {
        writeFileSync(sandboxEnvPath, '# Kortix Sandbox Environment\nENV_MODE=local\n');
      }
    }
    writeEnvFile(sandboxEnvPath, sandboxData);
  }

  // Re-run setup-env.sh to propagate
  try {
    execSync('bash scripts/setup-env.sh', { cwd: repoRoot, stdio: 'pipe', timeout: 15000 });
  } catch (e: any) {
    console.error('[admin] setup-env.sh failed:', e.message);
  }

  return c.json({ ok: true });
});

/** GET /v1/admin/api/instances — list all sandbox instances from DB */
adminApp.get('/api/instances', async (c) => {
  try {
    const { db } = await import('../shared/db');
    const { sandboxes } = await import('@kortix/db');

    const rows = await db
      .select()
      .from(sandboxes)
      .orderBy(desc(sandboxes.createdAt));

    const instances = rows.map((row) => ({
      sandbox_id: row.sandboxId,
      external_id: row.externalId,
      name: row.name,
      provider: row.provider,
      base_url: row.baseUrl,
      status: row.status,
      metadata: row.metadata,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    }));

    return c.json({ instances });
  } catch (e: any) {
    return c.json({ instances: [], error: e?.message || String(e) });
  }
});

/** GET /v1/admin/api/health — service health checks */
adminApp.get('/api/health', async (c) => {
  const repoRoot = findRepoRoot();
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  checks.api = { ok: true };

  if (!repoRoot) {
    try {
      await fetchMasterJson('/kortix/health', {}, 5000);
      checks.sandbox = { ok: true };
      checks.docker = { ok: true };
    } catch (e: any) {
      checks.sandbox = { ok: false, error: e?.message || String(e) };
      checks.docker = { ok: false, error: e?.message || String(e) };
    }
    return c.json(checks);
  }

  try {
    execSync('docker info', { stdio: 'pipe', timeout: 5000 });
    checks.docker = { ok: true };
  } catch {
    checks.docker = { ok: false, error: 'Docker not running' };
  }

  try {
    const out = execSync('docker inspect kortix-sandbox --format "{{.State.Status}}"', {
      stdio: 'pipe', timeout: 5000,
    }).toString().trim();
    checks.sandbox = { ok: out === 'running', error: out !== 'running' ? `Status: ${out}` : undefined };
  } catch {
    checks.sandbox = { ok: false, error: 'Container not found' };
  }

  return c.json(checks);
});

/** GET /v1/admin/api/status — system status */
adminApp.get('/api/status', async (c) => {
  const root = getProjectRoot();
  return c.json({
    envMode: config.ENV_MODE,
    internalEnv: config.INTERNAL_KORTIX_ENV,
    port: config.PORT,
    sandboxVersion: (await import('../config')).SANDBOX_VERSION,
    allowedProviders: config.ALLOWED_SANDBOX_PROVIDERS,
    schedulerEnabled: config.SCHEDULER_ENABLED,
    channelsEnabled: config.CHANNELS_ENABLED,
    billingEnabled: config.KORTIX_BILLING_INTERNAL_ENABLED,
    daytonaEnabled: config.isDaytonaEnabled(),
    localDockerEnabled: config.isLocalDockerEnabled(),
    databaseConfigured: !!config.DATABASE_URL,
    supabaseConfigured: !!config.SUPABASE_URL,
    stripeConfigured: !!config.STRIPE_SECRET_KEY,
  });
});

// ─── Admin HTML UI ──────────────────────────────────────────────────────────

adminApp.get('/', async (c) => {
  return c.html(getAdminHTML());
});

function getAdminHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kortix Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0b;
      --bg-card: #111113;
      --bg-input: #1a1a1d;
      --bg-hover: #1e1e21;
      --border: #2a2a2d;
      --border-focus: #4a4a4d;
      --text: #e4e4e7;
      --text-dim: #71717a;
      --text-muted: #52525b;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --green: #22c55e;
      --green-dim: #15803d;
      --red: #ef4444;
      --red-dim: #991b1b;
      --yellow: #eab308;
      --yellow-dim: #854d0e;
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }

    .app {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    header h1 {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    header .status-bar {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--text-dim);
    }

    .status-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }

    .status-dot.ok { background: var(--green); }
    .status-dot.err { background: var(--red); }
    .status-dot.warn { background: var(--yellow); }
    .status-dot.loading { background: var(--text-muted); animation: pulse 1s infinite; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 24px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 3px;
    }

    .tab {
      flex: 1;
      padding: 8px 16px;
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.15s;
    }

    .tab:hover { color: var(--text); background: var(--bg-hover); }
    .tab.active { color: var(--text); background: var(--bg-input); }

    /* Sections */
    .section {
      display: none;
    }

    .section.active {
      display: block;
    }

    /* Cards */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      overflow: hidden;
    }

    .card-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }

    .card-header:hover { background: var(--bg-hover); }

    .card-header h3 {
      font-size: 14px;
      font-weight: 600;
    }

    .card-header .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--bg-input);
      color: var(--text-dim);
      border: 1px solid var(--border);
    }

    .card-header .badge.configured {
      background: rgba(34, 197, 94, 0.1);
      color: var(--green);
      border-color: var(--green-dim);
    }

    .card-header .chevron {
      transition: transform 0.2s;
      color: var(--text-muted);
      font-size: 12px;
    }

    .card.open .card-header .chevron { transform: rotate(180deg); }

    .card-body {
      display: none;
      padding: 0 16px 16px;
    }

    .card.open .card-body { display: block; }

    .card-desc {
      font-size: 12px;
      color: var(--text-dim);
      margin-bottom: 12px;
    }

    /* Key rows */
    .key-row {
      display: grid;
      grid-template-columns: 180px 1fr auto;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }

    .key-row label {
      font-size: 12px;
      color: var(--text-dim);
      font-family: var(--mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .key-row input {
      width: 100%;
      padding: 6px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      font-family: var(--mono);
      outline: none;
      transition: border-color 0.15s;
    }

    .key-row input:focus { border-color: var(--border-focus); }

    .key-row input::placeholder { color: var(--text-muted); }

    .key-status {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }

    .key-status.set { color: var(--green); }
    .key-status.unset { color: var(--text-muted); }

    .key-help {
      font-size: 11px;
      color: var(--accent);
      text-decoration: none;
      margin-left: 4px;
    }

    .key-help:hover { text-decoration: underline; }

    /* Buttons */
    .btn {
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-input);
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn:hover { background: var(--bg-hover); border-color: var(--border-focus); }

    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .btn-primary:hover { background: var(--accent-hover); }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .save-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 16px;
    }

    .save-msg {
      font-size: 12px;
      color: var(--green);
    }

    .save-msg.error {
      color: var(--red);
    }

    /* Instances table */
    .instances-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }

    .instances-table th {
      text-align: left;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
    }

    .instances-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 12px;
    }

    .instances-table tr:last-child td { border-bottom: none; }

    .instances-table tr:hover td { background: var(--bg-hover); }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }

    .status-badge.active { background: rgba(34, 197, 94, 0.1); color: var(--green); }
    .status-badge.stopped { background: rgba(234, 179, 8, 0.1); color: var(--yellow); }
    .status-badge.archived { background: rgba(113, 113, 122, 0.1); color: var(--text-dim); }
    .status-badge.error { background: rgba(239, 68, 68, 0.1); color: var(--red); }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-dim);
      font-size: 13px;
    }

    /* Status grid */
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .status-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
    }

    .status-item .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      margin-bottom: 4px;
    }

    .status-item .value {
      font-size: 14px;
      font-weight: 500;
      font-family: var(--mono);
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 13px;
      color: var(--text);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s;
      z-index: 100;
    }

    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.success { border-color: var(--green-dim); }
    .toast.error { border-color: var(--red-dim); color: var(--red); }

    /* Loading */
    .loading-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* Auth overlay */
    .auth-overlay {
      position: fixed;
      inset: 0;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .auth-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      width: 100%;
      max-width: 380px;
      text-align: center;
    }

    .auth-box h2 {
      font-size: 18px;
      margin-bottom: 8px;
    }

    .auth-box p {
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 20px;
    }

    .auth-box input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      margin-bottom: 12px;
      outline: none;
    }

    .auth-box input:focus { border-color: var(--border-focus); }

    .auth-error {
      font-size: 12px;
      color: var(--red);
      margin-bottom: 8px;
    }

    @media (max-width: 640px) {
      .key-row {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      .status-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <!-- Auth overlay -->
  <div id="auth-overlay" class="auth-overlay" style="display: none;">
    <div class="auth-box">
      <h2>Kortix Admin</h2>
      <p>Enter your Supabase JWT or sign in to access the admin panel.</p>
      <input type="password" id="auth-token" placeholder="Bearer token" />
      <div id="auth-error" class="auth-error" style="display: none;"></div>
      <button class="btn btn-primary" style="width: 100%;" onclick="authenticate()">Sign In</button>
    </div>
  </div>

  <!-- Main app -->
  <div class="app" id="main-app">
    <header>
      <h1>Kortix Admin</h1>
      <div class="status-bar" id="status-bar">
        <span><span class="status-dot loading" id="dot-api"></span>API</span>
        <span><span class="status-dot loading" id="dot-docker"></span>Docker</span>
        <span><span class="status-dot loading" id="dot-sandbox"></span>Sandbox</span>
      </div>
    </header>

    <div class="tabs">
      <button class="tab active" onclick="switchTab('credentials')">Credentials</button>
      <button class="tab" onclick="switchTab('instances')">Instances</button>
      <button class="tab" onclick="switchTab('status')">System Status</button>
    </div>

    <div id="section-credentials" class="section active">
      <div id="credentials-container">
        <div class="empty-state"><span class="loading-spinner"></span> Loading credentials...</div>
      </div>
      <div class="save-bar">
        <button class="btn btn-primary" id="save-btn" onclick="saveCredentials()" disabled>Save Changes</button>
        <span class="save-msg" id="save-msg"></span>
      </div>
    </div>

    <div id="section-instances" class="section">
      <div class="card">
        <div id="instances-container">
          <div class="empty-state"><span class="loading-spinner"></span> Loading instances...</div>
        </div>
      </div>
    </div>

    <div id="section-status" class="section">
      <div id="status-container">
        <div class="empty-state"><span class="loading-spinner"></span> Loading status...</div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    // ─── State ──────────────────────────────────────────────────
    let token = '';
    let schema = {};
    let envData = { masked: {}, configured: {} };
    let dirtyKeys = {};
    let activeTab = 'credentials';

    const API_BASE = '/v1/admin/api';

    // ─── Auth ───────────────────────────────────────────────────
    function getStoredToken() {
      return localStorage.getItem('kortix_admin_token') || '';
    }

    function setStoredToken(t) {
      localStorage.setItem('kortix_admin_token', t);
    }

    async function authenticate() {
      const input = document.getElementById('auth-token');
      const t = input.value.trim();
      if (!t) return;

      try {
        const res = await fetch(API_BASE + '/status', {
          headers: { 'Authorization': 'Bearer ' + t }
        });
        if (!res.ok) throw new Error('Invalid token');

        token = t;
        setStoredToken(t);
        document.getElementById('auth-overlay').style.display = 'none';
        loadAll();
      } catch (e) {
        document.getElementById('auth-error').textContent = 'Authentication failed. Check your token.';
        document.getElementById('auth-error').style.display = 'block';
      }
    }

    async function checkAuth() {
      const stored = getStoredToken();
      if (!stored) {
        document.getElementById('auth-overlay').style.display = 'flex';
        return;
      }

      try {
        const res = await fetch(API_BASE + '/status', {
          headers: { 'Authorization': 'Bearer ' + stored }
        });
        if (!res.ok) throw new Error();
        token = stored;
        loadAll();
      } catch {
        document.getElementById('auth-overlay').style.display = 'flex';
      }
    }

    // ─── API Helpers ────────────────────────────────────────────
    async function apiFetch(path, opts = {}) {
      const res = await fetch(API_BASE + path, {
        ...opts,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
      });
      if (res.status === 401) {
        token = '';
        setStoredToken('');
        document.getElementById('auth-overlay').style.display = 'flex';
        throw new Error('Unauthorized');
      }
      return res.json();
    }

    // ─── Data Loading ───────────────────────────────────────────
    async function loadAll() {
      await Promise.all([loadSchema(), loadEnv(), loadHealth()]);
      renderCredentials();
      loadInstances();
      loadStatus();
    }

    async function loadSchema() {
      schema = await apiFetch('/schema');
    }

    async function loadEnv() {
      envData = await apiFetch('/env');
    }

    async function loadHealth() {
      try {
        const health = await apiFetch('/health');
        updateDot('dot-api', health.api?.ok);
        updateDot('dot-docker', health.docker?.ok);
        updateDot('dot-sandbox', health.sandbox?.ok);
      } catch {
        updateDot('dot-api', false);
        updateDot('dot-docker', null);
        updateDot('dot-sandbox', null);
      }
    }

    function updateDot(id, ok) {
      const dot = document.getElementById(id);
      dot.className = 'status-dot ' + (ok === true ? 'ok' : ok === false ? 'err' : 'warn');
    }

    // ─── Credentials Rendering ──────────────────────────────────
    function renderCredentials() {
      const container = document.getElementById('credentials-container');
      let html = '';

      for (const [groupId, group] of Object.entries(schema)) {
        const configuredCount = group.keys.filter(k => envData.configured[k.key]).length;
        const totalCount = group.keys.length;
        const allConfigured = configuredCount === totalCount;

        html += '<div class="card" id="card-' + groupId + '">';
        html += '<div class="card-header" onclick="toggleCard(\\'' + groupId + '\\')">';
        html += '<div><h3>' + group.title + '</h3></div>';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        html += '<span class="badge ' + (allConfigured ? 'configured' : '') + '">' + configuredCount + '/' + totalCount + '</span>';
        html += '<span class="chevron">&#9660;</span>';
        html += '</div></div>';
        html += '<div class="card-body">';
        html += '<div class="card-desc">' + (group.description || '') + '</div>';

        for (const k of group.keys) {
          const isSet = envData.configured[k.key];
          const masked = envData.masked[k.key] || '';
          html += '<div class="key-row">';
          html += '<label title="' + k.key + '">' + k.key;
          if (k.helpUrl) {
            html += ' <a href="' + k.helpUrl + '" target="_blank" class="key-help">?</a>';
          }
          html += '</label>';
          html += '<input type="text" id="key-' + k.key + '" placeholder="' + (isSet ? masked : 'Not set') + '" oninput="markDirty(\\'' + k.key + '\\')" />';
          html += '<span class="key-status ' + (isSet ? 'set' : 'unset') + '">' + (isSet ? '&#10003;' : '&#8212;') + '</span>';
          html += '</div>';
        }

        html += '</div></div>';
      }

      container.innerHTML = html;
    }

    function toggleCard(id) {
      const card = document.getElementById('card-' + id);
      card.classList.toggle('open');
    }

    function markDirty(key) {
      const input = document.getElementById('key-' + key);
      const val = input.value.trim();
      if (val) {
        dirtyKeys[key] = val;
      } else {
        delete dirtyKeys[key];
      }
      document.getElementById('save-btn').disabled = Object.keys(dirtyKeys).length === 0;
    }

    async function saveCredentials() {
      if (Object.keys(dirtyKeys).length === 0) return;

      const btn = document.getElementById('save-btn');
      const msg = document.getElementById('save-msg');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      msg.textContent = '';

      try {
        const result = await apiFetch('/env', {
          method: 'POST',
          body: JSON.stringify({ keys: { ...dirtyKeys } }),
        });

        if (result.ok) {
          dirtyKeys = {};
          msg.textContent = 'Saved successfully';
          msg.className = 'save-msg';
          showToast('Credentials saved', 'success');
          // Reload env data to reflect changes
          await loadEnv();
          renderCredentials();
        } else {
          throw new Error(result.error || 'Save failed');
        }
      } catch (e) {
        msg.textContent = e.message;
        msg.className = 'save-msg error';
        showToast('Save failed: ' + e.message, 'error');
      }

      btn.textContent = 'Save Changes';
      btn.disabled = Object.keys(dirtyKeys).length === 0;
    }

    // ─── Instances Rendering ────────────────────────────────────
    async function loadInstances() {
      const container = document.getElementById('instances-container');
      try {
        const data = await apiFetch('/instances');
        if (!data.instances || data.instances.length === 0) {
          container.innerHTML = '<div class="empty-state">No sandbox instances found.</div>';
          return;
        }

        let html = '<table class="instances-table"><thead><tr>';
        html += '<th>Name</th><th>Provider</th><th>Status</th><th>External ID</th><th>Created</th>';
        html += '</tr></thead><tbody>';

        for (const inst of data.instances) {
          const statusClass = inst.status === 'active' ? 'active' :
                              inst.status === 'stopped' ? 'stopped' :
                              inst.status === 'archived' ? 'archived' : 'error';
          html += '<tr>';
          html += '<td>' + (inst.name || inst.sandbox_id.slice(0, 8)) + '</td>';
          html += '<td>' + (inst.provider || '-') + '</td>';
          html += '<td><span class="status-badge ' + statusClass + '">' + inst.status + '</span></td>';
          html += '<td title="' + (inst.external_id || '') + '">' + (inst.external_id ? inst.external_id.slice(0, 16) + '...' : '-') + '</td>';
          html += '<td>' + new Date(inst.created_at).toLocaleDateString() + '</td>';
          html += '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="empty-state">Failed to load instances: ' + e.message + '</div>';
      }
    }

    // ─── Status Rendering ───────────────────────────────────────
    async function loadStatus() {
      const container = document.getElementById('status-container');
      try {
        const data = await apiFetch('/status');
        let html = '<div class="status-grid">';

        const items = [
          ['Mode', data.envMode],
          ['Environment', data.internalEnv],
          ['Port', data.port],
          ['Sandbox Version', data.sandboxVersion],
          ['Providers', (data.allowedProviders || []).join(', ')],
          ['Scheduler', data.schedulerEnabled ? 'Enabled' : 'Disabled'],
          ['Channels', data.channelsEnabled ? 'Enabled' : 'Disabled'],
          ['Billing', data.billingEnabled ? 'Enabled' : 'Disabled'],
          ['Daytona', data.daytonaEnabled ? 'Enabled' : 'Disabled'],
          ['Local Docker', data.localDockerEnabled ? 'Enabled' : 'Disabled'],
          ['Database', data.databaseConfigured ? 'Configured' : 'Not Set'],
          ['Supabase', data.supabaseConfigured ? 'Configured' : 'Not Set'],
          ['Stripe', data.stripeConfigured ? 'Configured' : 'Not Set'],
        ];

        for (const [label, value] of items) {
          html += '<div class="status-item"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="empty-state">Failed to load status: ' + e.message + '</div>';
      }
    }

    // ─── Tab Switching ──────────────────────────────────────────
    function switchTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelector('.tab[onclick*="' + tab + '"]').classList.add('active');
      document.getElementById('section-' + tab).classList.add('active');
    }

    // ─── Toast ──────────────────────────────────────────────────
    function showToast(msg, type) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'toast show ' + (type || '');
      setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    // ─── Init ───────────────────────────────────────────────────
    checkAuth();
  </script>
</body>
</html>`;
}
