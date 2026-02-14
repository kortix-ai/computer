/**
 * Setup routes — local mode only.
 *
 * Provides API endpoints for managing .env configuration and
 * system status after the initial wizard setup. These are
 * mounted at /v1/setup/* and only available in local mode.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { config } from '../config';

export const setupApp = new Hono<AppEnv>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function getProjectRoot(): string {
  // Walk up from CWD looking for docker-compose.local.yml
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

  return process.cwd();
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

// Keys that should also be written to sandbox/.env
const SANDBOX_KEYS = new Set([
  'OPENCODE_SERVER_USERNAME', 'OPENCODE_SERVER_PASSWORD',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
  'GEMINI_API_KEY', 'GROQ_API_KEY', 'XAI_API_KEY',
  'TAVILY_API_KEY', 'SERPER_API_KEY', 'FIRECRAWL_API_KEY',
  'REPLICATE_API_TOKEN', 'ELEVENLABS_API_KEY', 'CONTEXT7_API_KEY',
]);

// ─── Key schema ─────────────────────────────────────────────────────────────

const KEY_SCHEMA = {
  llm: {
    title: 'LLM Providers',
    description: 'At least one is required for the AI agent to function.',
    required: true,
    keys: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic', recommended: true },
      { key: 'OPENAI_API_KEY', label: 'OpenAI' },
      { key: 'OPENROUTER_API_KEY', label: 'OpenRouter' },
      { key: 'GEMINI_API_KEY', label: 'Google Gemini' },
      { key: 'GROQ_API_KEY', label: 'Groq' },
      { key: 'XAI_API_KEY', label: 'xAI (Grok)' },
    ],
  },
  tools: {
    title: 'Tool Providers',
    description: 'Optional. Enable web search, scraping, image generation, etc.',
    required: false,
    keys: [
      { key: 'TAVILY_API_KEY', label: 'Tavily (Web Search)' },
      { key: 'SERPER_API_KEY', label: 'Serper (Google Search)' },
      { key: 'FIRECRAWL_API_KEY', label: 'Firecrawl (Web Scraping)' },
      { key: 'REPLICATE_API_TOKEN', label: 'Replicate (Image/Video Gen)' },
      { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs (Text-to-Speech)' },
      { key: 'CONTEXT7_API_KEY', label: 'Context7 (Doc Search)' },
    ],
  },
  sandbox: {
    title: 'Sandbox Settings',
    description: 'Credentials for accessing the sandbox environment.',
    required: false,
    keys: [
      { key: 'OPENCODE_SERVER_USERNAME', label: 'Sandbox Username' },
      { key: 'OPENCODE_SERVER_PASSWORD', label: 'Sandbox Password' },
    ],
  },
};

// ─── Routes ─────────────────────────────────────────────────────────────────

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
  return c.json(KEY_SCHEMA);
});

/**
 * GET /v1/setup/env
 * Read current .env values (masked)
 */
setupApp.get('/env', async (c) => {
  const root = getProjectRoot();
  const rootEnv = parseEnvFile(resolve(root, '.env'));
  const sandboxEnv = parseEnvFile(resolve(root, 'sandbox/.env'));

  const masked: Record<string, string> = {};
  const configured: Record<string, boolean> = {};

  for (const group of Object.values(KEY_SCHEMA)) {
    for (const k of group.keys) {
      const val = rootEnv[k.key] || sandboxEnv[k.key] || '';
      masked[k.key] = maskKey(val);
      configured[k.key] = !!val;
    }
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

  const root = getProjectRoot();
  const rootData: Record<string, string> = {};
  const sandboxData: Record<string, string> = {};

  for (const [key, val] of Object.entries(keys)) {
    if (typeof val !== 'string') continue;
    rootData[key] = val;
    if (SANDBOX_KEYS.has(key)) {
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
  rootData.SANDBOX_PROVIDER = 'local_docker';
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
  sandboxData.KORTIX_API_URL = 'http://kortix-api:8008/v1/router';
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
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // Check API (self)
  checks.api = { ok: true };

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
