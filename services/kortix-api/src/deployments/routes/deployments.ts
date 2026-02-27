import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../../shared/db';
import { deployments } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';
import { config } from '../../config';
import type { AppEnv } from '../../types';

// ─── Dynamic Freestyle config ────────────────────────────────────────────────
// The Kortix API runs in a separate container from the sandbox. API keys set
// via the Secrets Manager are stored in the sandbox's secret store (Kortix
// Master /env). We fetch them from there at deploy-time so keys set after
// startup work without restarting the API service.

function getMasterUrlCandidates(): string[] {
  const candidates: string[] = [];
  const explicit = process.env.KORTIX_MASTER_URL;
  if (explicit?.trim()) candidates.push(explicit.trim());
  candidates.push('http://sandbox:8000');
  candidates.push(`http://localhost:${config.SANDBOX_PORT_BASE || 14000}`);
  return Array.from(new Set(candidates));
}

/** Try to read a single secret from the sandbox's Kortix Master /env/:key endpoint. */
async function readSandboxSecret(key: string): Promise<string> {
  const candidates = getMasterUrlCandidates();
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  const headers: Record<string, string> = {};
  if (serviceKey) headers['Authorization'] = `Bearer ${serviceKey}`;

  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${base}/env/${encodeURIComponent(key)}`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      // Response is { [key]: value } or { secrets: { ... } }
      const val = data?.[key] ?? data?.secrets?.[key] ?? '';
      if (typeof val === 'string' && val.trim()) return val.trim();
    } catch { /* try next candidate */ }
  }
  return '';
}

// Cache the fetched key for 60s to avoid hammering the sandbox on every request
let _cachedFreestyleKey = '';
let _cachedFreestyleKeyAt = 0;
const CACHE_TTL_MS = 60_000;

async function getFreestyleApiKey(): Promise<string> {
  // 1. process.env (set at container start)
  if (process.env.FREESTYLE_API_KEY) return process.env.FREESTYLE_API_KEY;
  // 2. Static config (same as process.env, but just in case)
  if (config.FREESTYLE_API_KEY) return config.FREESTYLE_API_KEY;
  // 3. Sandbox secret store (set via Secrets Manager at runtime)
  const now = Date.now();
  if (_cachedFreestyleKey && (now - _cachedFreestyleKeyAt) < CACHE_TTL_MS) {
    return _cachedFreestyleKey;
  }
  const val = await readSandboxSecret('FREESTYLE_API_KEY');
  if (val) {
    _cachedFreestyleKey = val;
    _cachedFreestyleKeyAt = now;
  }
  return val;
}

function getFreestyleApiUrl(): string {
  return process.env.FREESTYLE_API_URL || config.FREESTYLE_API_URL || 'https://api.freestyle.sh';
}

const app = new Hono<AppEnv>();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createDeploymentSchema = z.object({
  // Source type (required)
  source_type: z.enum(['git', 'code', 'files', 'tar']),

  // Git source
  source_ref: z.string().optional(),
  branch: z.string().optional(),
  root_path: z.string().optional(),

  // Code source
  code: z.string().optional(),

  // Files source
  files: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
        encoding: z.string().optional(),
      }),
    )
    .optional(),

  // Tar source
  tar_url: z.string().optional(),

  // Config
  domains: z.array(z.string()).min(1),
  build: z
    .union([
      z.boolean(),
      z.object({
        command: z.string().optional(),
        outDir: z.string().optional(),
        envVars: z.record(z.string()).optional(),
      }),
    ])
    .optional(),
  env_vars: z.record(z.string()).optional(),
  node_modules: z.record(z.string()).optional(),
  entrypoint: z.string().optional(),
  timeout_ms: z.number().optional(),
  static_only: z.boolean().optional(),
  public_dir: z.string().optional(),
  clean_urls: z.boolean().optional(),
  headers: z.array(z.any()).optional(),
  redirects: z.array(z.any()).optional(),
  network_permissions: z
    .array(
      z.object({
        action: z.enum(['allow', 'deny']),
        domain: z.string(),
        behavior: z.enum(['exact', 'regex']),
      }),
    )
    .optional(),
  framework: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getDeploymentForUser(deploymentId: string, userId: string) {
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.deploymentId, deploymentId), eq(deployments.accountId, userId)));
  return deployment ?? null;
}

/**
 * Build the Freestyle API source object from our request format.
 * This mirrors the transform done by the freestyle-sandboxes SDK.
 */
function buildFreestyleSource(data: z.infer<typeof createDeploymentSchema>) {
  switch (data.source_type) {
    case 'git':
      return {
        kind: 'git' as const,
        url: data.source_ref!,
        branch: data.branch,
        dir: data.root_path,
      };
    case 'code':
      return {
        kind: 'files' as const,
        files: {
          'index.ts': { content: data.code! },
        },
      };
    case 'files':
      return {
        kind: 'files' as const,
        files: Object.fromEntries(
          (data.files ?? []).map((f) => [f.path, { content: f.content, encoding: f.encoding }]),
        ),
      };
    case 'tar':
      return {
        kind: 'tar' as const,
        url: data.tar_url!,
      };
  }
}

/**
 * Build the Freestyle API config object from our request format.
 */
function buildFreestyleConfig(data: z.infer<typeof createDeploymentSchema>) {
  return {
    await: true,
    domains: data.domains,
    build: data.build,
    envVars: data.env_vars,
    nodeModules: data.node_modules,
    entrypoint: data.entrypoint,
    timeout: data.timeout_ms,
    staticOnly: data.static_only,
    publicDir: data.public_dir,
    cleanUrls: data.clean_urls,
    headers: data.headers,
    redirects: data.redirects,
    networkPermissions: data.network_permissions?.map((np) => ({
      action: np.action,
      query: np.domain,
      behavior: np.behavior,
    })),
  };
}

/**
 * Call the Freestyle REST API.
 */
async function callFreestyle(
  path: string,
  options: { method: string; body?: unknown; timeoutMs?: number },
) {
  const apiKey = await getFreestyleApiKey();
  const url = `${getFreestyleApiUrl()}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /v1/deployments - Create a deployment via Freestyle
app.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json();
  const parsed = createDeploymentSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  // Validate source-specific required fields
  const data = parsed.data;
  if (data.source_type === 'git' && !data.source_ref) {
    throw new ValidationError('source_ref is required for git deployments');
  }
  if (data.source_type === 'code' && !data.code) {
    throw new ValidationError('code is required for code deployments');
  }
  if (data.source_type === 'files' && (!data.files || data.files.length === 0)) {
    throw new ValidationError('files array is required for files deployments');
  }
  if (data.source_type === 'tar' && !data.tar_url) {
    throw new ValidationError('tar_url is required for tar deployments');
  }

  // Build the Freestyle payload upfront (needed for both DB metadata and API call)
  const freestyleSource = buildFreestyleSource(data);
  const freestyleConfig = buildFreestyleConfig(data);

  // Create deployment record in DB as pending — store full Freestyle payload in metadata for redeploy
  const [deployment] = await db
    .insert(deployments)
    .values({
      accountId: userId,
      status: 'pending',
      sourceType: data.source_type,
      sourceRef: data.source_ref ?? null,
      framework: data.framework ?? null,
      domains: data.domains,
      envVars: data.env_vars ?? {},
      buildConfig: (typeof data.build === 'object' && data.build !== null ? data.build : data.build === true ? { auto: true } : null) as Record<string, unknown> | null,
      entrypoint: data.entrypoint ?? null,
      metadata: { freestyleSource, freestyleConfig } as Record<string, unknown>,
    })
    .returning();

  // Check that Freestyle API key is configured — if not, mark as failed
  if (!(await getFreestyleApiKey())) {
    const [updated] = await db
      .update(deployments)
      .set({ status: 'failed', error: 'Freestyle API key not configured', updatedAt: new Date() })
      .where(eq(deployments.deploymentId, deployment.deploymentId))
      .returning();
    return c.json({ success: true, data: updated }, 201);
  }

  // Call Freestyle API to create the deployment
  try {
    const freestyleBody = {
      source: freestyleSource,
      config: freestyleConfig,
    };

    const response = await callFreestyle('/web/v1/deployment', {
      method: 'POST',
      body: freestyleBody,
      timeoutMs: 300000, // 5 min — builds (Go, Rust, etc.) can take a while
    });

    if (response.ok) {
      const result = await response.json();
      const freestyleId = result.deploymentId;
      const liveUrl = data.domains[0] ? `https://${data.domains[0]}` : null;

      const [updated] = await db
        .update(deployments)
        .set({
          status: 'active',
          freestyleId,
          liveUrl,
          updatedAt: new Date(),
        })
        .where(eq(deployments.deploymentId, deployment.deploymentId))
        .returning();

      return c.json({ success: true, data: updated }, 201);
    } else {
      const errorBody = await response.text().catch(() => 'Unknown Freestyle error');
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.message || parsed.description || errorBody;
      } catch {
        errorMessage = errorBody;
      }

      const [updated] = await db
        .update(deployments)
        .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
        .where(eq(deployments.deploymentId, deployment.deploymentId))
        .returning();

      return c.json({ success: true, data: updated }, 201);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Freestyle API unreachable';
    const [updated] = await db
      .update(deployments)
      .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
      .where(eq(deployments.deploymentId, deployment.deploymentId))
      .returning();

    return c.json({ success: true, data: updated }, 201);
  }
});

// GET /v1/deployments - List deployments (scoped to user)
app.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;

  const conditions = [eq(deployments.accountId, userId)];
  if (status) {
    conditions.push(eq(deployments.status, status as any));
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  const [results, [totalRow]] = await Promise.all([
    db
      .select()
      .from(deployments)
      .where(whereClause)
      .orderBy(desc(deployments.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(deployments).where(whereClause),
  ]);

  return c.json({
    success: true,
    data: results,
    total: totalRow?.total ?? 0,
    limit,
    offset,
  });
});

// GET /v1/deployments/:id - Get deployment details (scoped to user)
app.get('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  return c.json({ success: true, data: deployment });
});

// POST /v1/deployments/:id/stop - Stop a deployment (delete on Freestyle + update DB)
app.post('/:id/stop', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  // If the deployment has a Freestyle ID, delete it on Freestyle to actually stop it
  if (deployment.freestyleId && (await getFreestyleApiKey())) {
    try {
      await callFreestyle(`/web/v1/deployment/${deployment.freestyleId}`, {
        method: 'DELETE',
        timeoutMs: 15000,
      });
    } catch {
      // Best-effort — still mark as stopped locally even if Freestyle call fails
    }
  }

  const [updated] = await db
    .update(deployments)
    .set({ status: 'stopped', updatedAt: new Date() })
    .where(eq(deployments.deploymentId, deploymentId))
    .returning();

  return c.json({ success: true, data: updated });
});

// POST /v1/deployments/:id/redeploy - Create a new deployment with same config
app.post('/:id/redeploy', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const oldDeployment = await getDeploymentForUser(deploymentId, userId);
  if (!oldDeployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  // Create new deployment record with incremented version
  const [newDeployment] = await db
    .insert(deployments)
    .values({
      accountId: userId,
      status: 'pending',
      sourceType: oldDeployment.sourceType,
      sourceRef: oldDeployment.sourceRef,
      framework: oldDeployment.framework,
      domains: oldDeployment.domains,
      envVars: oldDeployment.envVars,
      buildConfig: oldDeployment.buildConfig,
      entrypoint: oldDeployment.entrypoint,
      version: oldDeployment.version + 1,
      metadata: oldDeployment.metadata,
    })
    .returning();

  // Check that Freestyle API key is configured — if not, mark as failed
  if (!(await getFreestyleApiKey())) {
    const [updated] = await db
      .update(deployments)
      .set({ status: 'failed', error: 'Freestyle API key not configured', updatedAt: new Date() })
      .where(eq(deployments.deploymentId, newDeployment.deploymentId))
      .returning();
    return c.json({ success: true, data: updated }, 201);
  }

  // Rebuild the Freestyle payload from stored metadata (saved during initial deploy)
  const meta = oldDeployment.metadata as Record<string, unknown> | null;
  const source: Record<string, unknown> = (meta?.freestyleSource as Record<string, unknown>) ??
    (oldDeployment.sourceType === 'git'
      ? { kind: 'git', url: oldDeployment.sourceRef }
      : oldDeployment.sourceType === 'tar'
        ? { kind: 'tar', url: oldDeployment.sourceRef }
        : { kind: 'files', files: {} });

  const freestyleConfig: Record<string, unknown> = (meta?.freestyleConfig as Record<string, unknown>) ?? {
    await: true,
    domains: oldDeployment.domains,
    envVars: oldDeployment.envVars,
    entrypoint: oldDeployment.entrypoint,
    ...(oldDeployment.buildConfig ? { build: oldDeployment.buildConfig } : {}),
  };

  try {
    const response = await callFreestyle('/web/v1/deployment', {
      method: 'POST',
      body: { source, config: freestyleConfig },
      timeoutMs: 120000,
    });

    if (response.ok) {
      const result = await response.json();
      const freestyleId = result.deploymentId;
      const liveUrl =
        oldDeployment.domains && (oldDeployment.domains as string[]).length > 0
          ? `https://${(oldDeployment.domains as string[])[0]}`
          : null;

      const [updated] = await db
        .update(deployments)
        .set({ status: 'active', freestyleId, liveUrl, updatedAt: new Date() })
        .where(eq(deployments.deploymentId, newDeployment.deploymentId))
        .returning();

      return c.json({ success: true, data: updated }, 201);
    } else {
      const errorText = await response.text().catch(() => 'Unknown Freestyle error');
      const [updated] = await db
        .update(deployments)
        .set({ status: 'failed', error: errorText, updatedAt: new Date() })
        .where(eq(deployments.deploymentId, newDeployment.deploymentId))
        .returning();

      return c.json({ success: true, data: updated }, 201);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Freestyle API unreachable';
    const [updated] = await db
      .update(deployments)
      .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
      .where(eq(deployments.deploymentId, newDeployment.deploymentId))
      .returning();

    return c.json({ success: true, data: updated }, 201);
  }
});

// DELETE /v1/deployments/:id - Delete deployment record (scoped to user)
app.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  // If the deployment has a Freestyle ID, try to delete it on Freestyle too
  if (deployment.freestyleId && (await getFreestyleApiKey())) {
    try {
      await callFreestyle(`/web/v1/deployment/${deployment.freestyleId}`, {
        method: 'DELETE',
        timeoutMs: 15000,
      });
    } catch {
      // Best-effort — don't block local deletion if Freestyle call fails
    }
  }

  await db
    .delete(deployments)
    .where(and(eq(deployments.deploymentId, deploymentId), eq(deployments.accountId, userId)));

  return c.json({ success: true, message: 'Deployment deleted' });
});

// GET /v1/deployments/:id/logs - Get deployment logs from Freestyle
app.get('/:id/logs', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  if (!deployment.freestyleId) {
    return c.json({
      success: true,
      data: { logs: [], message: 'No Freestyle deployment ID — deployment may not have been created yet.' },
    });
  }

  if (!(await getFreestyleApiKey())) {
    return c.json({ success: false, error: 'Freestyle API key not configured' }, 502);
  }

  try {
    const response = await callFreestyle(
      `/observability/v1/logs?deploymentId=${deployment.freestyleId}`,
      { method: 'GET', timeoutMs: 15000 },
    );

    const data = await response.json();
    return c.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Freestyle API unreachable';
    return c.json({ success: false, error: errorMessage }, 502);
  }
});

export { app as deploymentsRouter };
