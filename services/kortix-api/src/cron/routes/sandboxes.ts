import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/db';
import { sandboxes } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';
import { OpenCodeClient } from '../services/opencode';
import type { AppEnv } from '../../types';

const app = new Hono<AppEnv>();

// ─── Validation Schemas ──────────────────────────────────────────────────────
const createSandboxSchema = z.object({
  name: z.string().min(1).max(255),
  base_url: z.string().url(),
  auth_token: z.string().optional(),
  external_id: z.string().optional(),
  status: z.enum(['provisioning', 'active', 'stopped', 'archived', 'pooled', 'error']).default('active'),
  config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSandboxSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  base_url: z.string().url().optional(),
  auth_token: z.string().nullable().optional(),
  external_id: z.string().nullable().optional(),
  status: z.enum(['provisioning', 'active', 'stopped', 'archived', 'pooled', 'error']).optional(),
  config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /v1/sandboxes - Register a sandbox target
app.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json();
  const parsed = createSandboxSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const [sandbox] = await db
    .insert(sandboxes)
    .values({
      accountId: userId,
      name: parsed.data.name,
      baseUrl: parsed.data.base_url,
      authToken: parsed.data.auth_token ?? null,
      externalId: parsed.data.external_id ?? null,
      status: parsed.data.status,
      config: parsed.data.config ?? {},
      metadata: parsed.data.metadata ?? {},
    })
    .returning();

  return c.json({ success: true, data: sandbox }, 201);
});

// GET /v1/sandboxes - List sandboxes for account
app.get('/', async (c) => {
  const userId = c.get('userId') as string;

  const results = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.accountId, userId));

  return c.json({ success: true, data: results, total: results.length });
});

// GET /v1/sandboxes/:id - Get sandbox details
app.get('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const sandboxId = c.req.param('id');

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, userId)));

  if (!sandbox) {
    throw new NotFoundError('Sandbox', sandboxId);
  }

  return c.json({ success: true, data: sandbox });
});

// PATCH /v1/sandboxes/:id - Update sandbox config
app.patch('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const sandboxId = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSandboxSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.base_url !== undefined) updateData.baseUrl = parsed.data.base_url;
  if (parsed.data.auth_token !== undefined) updateData.authToken = parsed.data.auth_token;
  if (parsed.data.external_id !== undefined) updateData.externalId = parsed.data.external_id;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.config !== undefined) updateData.config = parsed.data.config;
  if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata;

  const [updated] = await db
    .update(sandboxes)
    .set(updateData)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, userId)))
    .returning();

  if (!updated) {
    throw new NotFoundError('Sandbox', sandboxId);
  }

  return c.json({ success: true, data: updated });
});

// DELETE /v1/sandboxes/:id - Remove sandbox
app.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const sandboxId = c.req.param('id');

  const [deleted] = await db
    .delete(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, userId)))
    .returning();

  if (!deleted) {
    throw new NotFoundError('Sandbox', sandboxId);
  }

  return c.json({ success: true, message: 'Sandbox deleted' });
});

// POST /v1/sandboxes/:id/health - Check sandbox health
app.post('/:id/health', async (c) => {
  const userId = c.get('userId') as string;
  const sandboxId = c.req.param('id');

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.accountId, userId)));

  if (!sandbox) {
    throw new NotFoundError('Sandbox', sandboxId);
  }

  const client = new OpenCodeClient(sandbox);
  const healthy = await client.healthCheck();

  return c.json({
    success: true,
    data: {
      sandboxId: sandbox.sandboxId,
      name: sandbox.name,
      status: sandbox.status,
      healthy,
      baseUrl: sandbox.baseUrl,
    },
  });
});

export { app as sandboxesRouter };
