import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../../shared/db';
import { deployments, sandboxes } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';
import type { AppEnv } from '../../types';

const app = new Hono<AppEnv>();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createDeploymentSchema = z.object({
  sandbox_id: z.string().uuid(),
  source_type: z.enum(['git', 'code', 'files', 'tar']),
  source_ref: z.string().optional(),
  source_path: z.string().optional().default('/workspace'),
  framework: z.string().optional(),
  domains: z.array(z.string()).optional(),
  env_var_keys: z.array(z.string()).optional(),
  build_config: z.record(z.unknown()).optional(),
  entrypoint: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSandboxForUser(sandboxId: string, userId: string) {
  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, userId)));
  return sandbox ?? null;
}

async function getDeploymentForUser(deploymentId: string, userId: string) {
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.deploymentId, deploymentId), eq(deployments.accountId, userId)));
  return deployment ?? null;
}

async function callSandbox(
  baseUrl: string,
  authToken: string | null,
  path: string,
  options: { method: string; body?: unknown; timeoutMs?: number },
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

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

// POST /v1/deployments - Create a deployment
app.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json();
  const parsed = createDeploymentSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  // Verify sandbox belongs to user
  const sandbox = await getSandboxForUser(parsed.data.sandbox_id, userId);
  if (!sandbox) {
    throw new NotFoundError('Sandbox', parsed.data.sandbox_id);
  }

  // Create deployment record
  const [deployment] = await db
    .insert(deployments)
    .values({
      accountId: userId,
      sandboxId: parsed.data.sandbox_id,
      status: 'pending',
      sourceType: parsed.data.source_type,
      sourceRef: parsed.data.source_ref ?? null,
      sourcePath: parsed.data.source_path ?? '/workspace',
      framework: parsed.data.framework ?? null,
      domains: parsed.data.domains ?? [],
      envVarKeys: parsed.data.env_var_keys ?? [],
      buildConfig: parsed.data.build_config ?? null,
      entrypoint: parsed.data.entrypoint ?? null,
    })
    .returning();

  // Call sandbox to build/deploy
  try {
    const response = await callSandbox(sandbox.baseUrl, sandbox.authToken, '/kortix/deploy', {
      method: 'POST',
      body: {
        deploymentId: deployment.deploymentId,
        sourceType: parsed.data.source_type,
        sourceRef: parsed.data.source_ref,
        sourcePath: parsed.data.source_path ?? '/workspace',
        framework: parsed.data.framework,
        envVarKeys: parsed.data.env_var_keys,
        buildConfig: parsed.data.build_config,
        entrypoint: parsed.data.entrypoint,
      },
      timeoutMs: 30000,
    });

    if (response.ok) {
      const [updated] = await db
        .update(deployments)
        .set({ status: 'building', updatedAt: new Date() })
        .where(eq(deployments.deploymentId, deployment.deploymentId))
        .returning();
      return c.json({ success: true, data: updated }, 201);
    } else {
      const errorText = await response.text().catch(() => 'Unknown sandbox error');
      const [updated] = await db
        .update(deployments)
        .set({ status: 'failed', error: errorText, updatedAt: new Date() })
        .where(eq(deployments.deploymentId, deployment.deploymentId))
        .returning();
      return c.json({ success: true, data: updated }, 201);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Sandbox unreachable';
    const [updated] = await db
      .update(deployments)
      .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
      .where(eq(deployments.deploymentId, deployment.deploymentId))
      .returning();
    return c.json({ success: true, data: updated }, 201);
  }
});

// GET /v1/deployments - List deployments
app.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const sandboxId = c.req.query('sandbox_id');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;

  const conditions = [eq(deployments.accountId, userId)];
  if (sandboxId) {
    conditions.push(eq(deployments.sandboxId, sandboxId));
  }
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
    db
      .select({ total: count() })
      .from(deployments)
      .where(whereClause),
  ]);

  return c.json({
    success: true,
    data: results,
    total: totalRow?.total ?? 0,
    limit,
    offset,
  });
});

// GET /v1/deployments/:id - Get deployment details
app.get('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  return c.json({ success: true, data: deployment });
});

// POST /v1/deployments/:id/stop - Stop a deployment
app.post('/:id/stop', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  // Get sandbox to call stop
  if (deployment.sandboxId) {
    const sandbox = await getSandboxForUser(deployment.sandboxId, userId);
    if (sandbox) {
      try {
        await callSandbox(sandbox.baseUrl, sandbox.authToken, `/kortix/deploy/${deploymentId}/stop`, {
          method: 'POST',
          timeoutMs: 10000,
        });
      } catch {
        // Sandbox unreachable — still mark as stopped
      }
    }
  }

  const [updated] = await db
    .update(deployments)
    .set({ status: 'stopped', updatedAt: new Date() })
    .where(eq(deployments.deploymentId, deploymentId))
    .returning();

  return c.json({ success: true, data: updated });
});

// POST /v1/deployments/:id/redeploy - Redeploy (rebuild and restart)
app.post('/:id/redeploy', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const oldDeployment = await getDeploymentForUser(deploymentId, userId);
  if (!oldDeployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  if (!oldDeployment.sandboxId) {
    throw new ValidationError('Deployment has no associated sandbox');
  }

  const sandbox = await getSandboxForUser(oldDeployment.sandboxId, userId);
  if (!sandbox) {
    throw new NotFoundError('Sandbox', oldDeployment.sandboxId);
  }

  // Create new deployment record with incremented version
  const [newDeployment] = await db
    .insert(deployments)
    .values({
      accountId: userId,
      sandboxId: oldDeployment.sandboxId,
      status: 'pending',
      sourceType: oldDeployment.sourceType,
      sourceRef: oldDeployment.sourceRef,
      sourcePath: oldDeployment.sourcePath,
      framework: oldDeployment.framework,
      domains: oldDeployment.domains,
      envVarKeys: oldDeployment.envVarKeys,
      buildConfig: oldDeployment.buildConfig,
      entrypoint: oldDeployment.entrypoint,
      version: oldDeployment.version + 1,
    })
    .returning();

  // Call sandbox to build/deploy
  try {
    const response = await callSandbox(sandbox.baseUrl, sandbox.authToken, '/kortix/deploy', {
      method: 'POST',
      body: {
        deploymentId: newDeployment.deploymentId,
        sourceType: oldDeployment.sourceType,
        sourceRef: oldDeployment.sourceRef,
        sourcePath: oldDeployment.sourcePath,
        framework: oldDeployment.framework,
        envVarKeys: oldDeployment.envVarKeys,
        buildConfig: oldDeployment.buildConfig,
        entrypoint: oldDeployment.entrypoint,
      },
      timeoutMs: 30000,
    });

    if (response.ok) {
      const [updated] = await db
        .update(deployments)
        .set({ status: 'building', updatedAt: new Date() })
        .where(eq(deployments.deploymentId, newDeployment.deploymentId))
        .returning();
      return c.json({ success: true, data: updated }, 201);
    } else {
      const errorText = await response.text().catch(() => 'Unknown sandbox error');
      const [updated] = await db
        .update(deployments)
        .set({ status: 'failed', error: errorText, updatedAt: new Date() })
        .where(eq(deployments.deploymentId, newDeployment.deploymentId))
        .returning();
      return c.json({ success: true, data: updated }, 201);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Sandbox unreachable';
    const [updated] = await db
      .update(deployments)
      .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
      .where(eq(deployments.deploymentId, newDeployment.deploymentId))
      .returning();
    return c.json({ success: true, data: updated }, 201);
  }
});

// DELETE /v1/deployments/:id - Delete deployment record
app.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  // If active, stop it first
  if (deployment.status === 'active' && deployment.sandboxId) {
    const sandbox = await getSandboxForUser(deployment.sandboxId, userId);
    if (sandbox) {
      try {
        await callSandbox(sandbox.baseUrl, sandbox.authToken, `/kortix/deploy/${deploymentId}/stop`, {
          method: 'POST',
          timeoutMs: 10000,
        });
      } catch {
        // Sandbox unreachable — proceed with deletion anyway
      }
    }
  }

  await db
    .delete(deployments)
    .where(and(eq(deployments.deploymentId, deploymentId), eq(deployments.accountId, userId)));

  return c.json({ success: true, message: 'Deployment deleted' });
});

// GET /v1/deployments/:id/logs - Get deployment logs
app.get('/:id/logs', async (c) => {
  const userId = c.get('userId') as string;
  const deploymentId = c.req.param('id');

  const deployment = await getDeploymentForUser(deploymentId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment', deploymentId);
  }

  if (!deployment.sandboxId) {
    throw new ValidationError('Deployment has no associated sandbox');
  }

  const sandbox = await getSandboxForUser(deployment.sandboxId, userId);
  if (!sandbox) {
    throw new NotFoundError('Sandbox', deployment.sandboxId);
  }

  try {
    const response = await callSandbox(sandbox.baseUrl, sandbox.authToken, `/kortix/deploy/${deploymentId}/logs`, {
      method: 'GET',
      timeoutMs: 10000,
    });

    const data = await response.json();
    return c.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Sandbox unreachable';
    return c.json({ success: false, error: errorMessage }, 502);
  }
});

export { app as deploymentsRouter };
