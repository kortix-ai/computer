/**
 * Server entries CRUD — persists user-configured instances to the database.
 *
 * Stores URL, label, provider, sandboxId, mappedPorts — everything EXCEPT
 * auth tokens (those stay in the browser's localStorage for security).
 *
 * Mounted at /v1/servers/*
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { serverEntries } from '@kortix/db';
import type { AppEnv } from '../types';
import { db } from '../shared/db';

export const serversApp = new Hono<AppEnv>();

// ─── Static routes MUST come before parameterized /:id routes ───────────────

// PUT /v1/servers/sync — bulk upsert from frontend (initial sync)
serversApp.put('/sync', async (c) => {
  const body = await c.req.json<{
    servers: Array<{
      id: string;
      label: string;
      url: string;
      isDefault?: boolean;
      provider?: 'daytona' | 'local_docker';
      sandboxId?: string;
      mappedPorts?: Record<string, string>;
    }>;
  }>();

  if (!Array.isArray(body.servers)) {
    return c.json({ error: 'servers array is required' }, 400);
  }

  const results = [];
  for (const s of body.servers) {
    if (!s.id || !s.label || !s.url) continue;
    const [row] = await db
      .insert(serverEntries)
      .values({
        id: s.id,
        label: s.label,
        url: s.url,
        isDefault: s.isDefault ?? false,
        provider: s.provider ?? null,
        sandboxId: s.sandboxId ?? null,
        mappedPorts: s.mappedPorts ?? null,
      })
      .onConflictDoUpdate({
        target: serverEntries.id,
        set: {
          label: s.label,
          url: s.url,
          isDefault: s.isDefault ?? false,
          provider: s.provider ?? null,
          sandboxId: s.sandboxId ?? null,
          mappedPorts: s.mappedPorts ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    results.push(row);
  }

  return c.json(results);
});

// ─── CRUD routes ────────────────────────────────────────────────────────────

// GET /v1/servers — list all server entries
serversApp.get('/', async (c) => {
  const rows = await db.select().from(serverEntries).orderBy(serverEntries.createdAt);
  return c.json(rows);
});

// GET /v1/servers/:id — get a single server entry
serversApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db.select().from(serverEntries).where(eq(serverEntries.id, id));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// POST /v1/servers — create a new server entry
serversApp.post('/', async (c) => {
  const body = await c.req.json<{
    id: string;
    label: string;
    url: string;
    isDefault?: boolean;
    provider?: 'daytona' | 'local_docker';
    sandboxId?: string;
    mappedPorts?: Record<string, string>;
  }>();

  if (!body.id || !body.label || !body.url) {
    return c.json({ error: 'id, label, and url are required' }, 400);
  }

  const [row] = await db
    .insert(serverEntries)
    .values({
      id: body.id,
      label: body.label,
      url: body.url,
      isDefault: body.isDefault ?? false,
      provider: body.provider ?? null,
      sandboxId: body.sandboxId ?? null,
      mappedPorts: body.mappedPorts ?? null,
    })
    .onConflictDoUpdate({
      target: serverEntries.id,
      set: {
        label: body.label,
        url: body.url,
        isDefault: body.isDefault ?? false,
        provider: body.provider ?? null,
        sandboxId: body.sandboxId ?? null,
        mappedPorts: body.mappedPorts ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json(row, 201);
});

// PUT /v1/servers/:id — update an existing server entry
serversApp.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    label?: string;
    url?: string;
    isDefault?: boolean;
    provider?: 'daytona' | 'local_docker' | null;
    sandboxId?: string | null;
    mappedPorts?: Record<string, string> | null;
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.label !== undefined) updates.label = body.label;
  if (body.url !== undefined) updates.url = body.url;
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault;
  if (body.provider !== undefined) updates.provider = body.provider;
  if (body.sandboxId !== undefined) updates.sandboxId = body.sandboxId;
  if (body.mappedPorts !== undefined) updates.mappedPorts = body.mappedPorts;

  const [row] = await db
    .update(serverEntries)
    .set(updates)
    .where(eq(serverEntries.id, id))
    .returning();

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// DELETE /v1/servers/:id — delete a server entry
serversApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db
    .delete(serverEntries)
    .where(eq(serverEntries.id, id))
    .returning();

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});
