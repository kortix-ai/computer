/**
 * Secrets routes — raw KV CRUD for sandbox environment variables.
 *
 * Pure proxy to kortix-master's /env API. That's the single source of truth.
 * Template keys are seeded at container startup (Dockerfile / init script),
 * not here.
 *
 * Mounted at /v1/secrets/*
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { config } from '../config';

export const secretsApp = new Hono<AppEnv>();

// ─── kortix-master proxy helpers ────────────────────────────────────────────

function getMasterUrlCandidates(): string[] {
  const candidates: string[] = [];
  const explicit = process.env.KORTIX_MASTER_URL;
  if (explicit && explicit.trim()) candidates.push(explicit.trim());
  candidates.push('http://sandbox:8000');
  candidates.push(`http://localhost:${config.SANDBOX_PORT_BASE || 14000}`);
  return Array.from(new Set(candidates));
}

async function fetchMaster(path: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const candidates = getMasterUrlCandidates();

  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (serviceKey) {
    const existing = init.headers ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries()) : {};
    init = { ...init, headers: { ...existing, Authorization: `Bearer ${serviceKey}` } };
  }

  let lastErr: unknown = null;
  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to reach kortix-master');
}

function maskValue(val: string): string {
  if (!val || val.length < 8) return val ? '****' : '';
  return val.slice(0, 4) + '...' + val.slice(-4);
}

// Keys hidden from listing (internal / infra)
const HIDDEN_KEYS = new Set([
  'ONBOARDING_COMPLETE', 'ONBOARDING_SESSION_ID', 'ONBOARDING_USER_NAME',
  'ONBOARDING_USER_SUMMARY', 'ONBOARDING_COMPLETED_AT',
  'SANDBOX_ID', 'PROJECT_ID', 'ENV_MODE',
  'KORTIX_API_URL', 'KORTIX_TOKEN',
]);

// ─── Routes ─────────────────────────────────────────────────────────────────

/** GET /v1/secrets — list all env vars with masked values. */
secretsApp.get('/', async (c) => {
  try {
    const res = await fetchMaster('/env');
    if (!res.ok) return c.json({ secrets: {} });
    const envMap = await res.json() as Record<string, string>;

    const secrets: Record<string, string> = {};
    for (const [key, val] of Object.entries(envMap)) {
      if (HIDDEN_KEYS.has(key)) continue;
      secrets[key] = maskValue(val);
    }

    return c.json({ secrets });
  } catch {
    return c.json({ secrets: {} });
  }
});

/** PUT /v1/secrets/:key — set a single env var. */
secretsApp.put('/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json();
  const value = body?.value;

  if (typeof value !== 'string') {
    return c.json({ error: 'Request body must contain a "value" string' }, 400);
  }

  try {
    const res = await fetchMaster(`/env/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value.trim() }),
    }, 15000);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return c.json({ ok: false, error: `kortix-master returned ${res.status}`, details: detail }, 500);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: 'Failed to save secret', details: e?.message || String(e) }, 500);
  }
});

/** DELETE /v1/secrets/:key — remove a single env var. */
secretsApp.delete('/:key', async (c) => {
  const key = c.req.param('key');

  try {
    const res = await fetchMaster(`/env/${key}`, { method: 'DELETE' }, 5000);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return c.json({ ok: false, error: `kortix-master returned ${res.status}`, details: detail }, 500);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: 'Failed to delete secret', details: e?.message || String(e) }, 500);
  }
});
