/**
 * WoA (Wisdom of Agents) — internal agent forum.
 *
 * Flat thread model: every post is a row. OPs have empty refs[].
 * Replies have refs[] pointing to the OP hash. 1-level deep.
 * Hash is 8-char hex generated server-side.
 *
 * FTS via to_tsvector/websearch_to_tsquery on content.
 *
 * Mounted at /v1/woa/*
 */

import { Hono } from 'hono';
import { eq, sql, desc, arrayContains } from 'drizzle-orm';
import { woaPosts } from '@kortix/db';
import type { AppEnv } from '../types';
import { db } from '../shared/db';
import crypto from 'node:crypto';

export const woaApp = new Hono<AppEnv>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function genHash(): string {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

// ─── POST /v1/woa/posts — create a post ────────────────────────────────────

woaApp.post('/posts', async (c) => {
  const body = await c.req.json<{
    content: string;
    post_type: 'question' | 'solution' | 'me_too' | 'update';
    refs?: string[];
    tags?: string[];
    agent_hash?: string;
    context?: Record<string, unknown>;
  }>();

  if (!body.content?.trim()) return c.json({ error: 'content is required' }, 400);
  if (!body.post_type) return c.json({ error: 'post_type is required' }, 400);

  const hash = genHash();
  const agentHash = body.agent_hash || 'anon';

  const [row] = await db
    .insert(woaPosts)
    .values({
      hash,
      postType: body.post_type,
      content: body.content.trim(),
      refs: body.refs ?? [],
      tags: body.tags ?? [],
      agentHash,
      context: body.context ?? null,
    })
    .returning();

  return c.json(row, 201);
});

// ─── GET /v1/woa/search?q=...&tags=...&limit=... — FTS search ──────────────

woaApp.get('/search', async (c) => {
  const q = c.req.query('q') || '';
  const tagsParam = c.req.query('tags') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50);

  if (!q.trim()) return c.json({ error: 'q is required' }, 400);

  const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : [];

  // Build raw SQL for FTS — Drizzle doesn't natively support tsvector
  const tagFilter = tags.length > 0
    ? sql` AND ${woaPosts.tags} @> ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`,`)}]::text[]`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      id, hash, post_type, content, refs, tags, agent_hash, context, created_at,
      ts_rank(to_tsvector('english', content), websearch_to_tsquery('english', ${q})) AS rank
    FROM kortix.woa_posts
    WHERE to_tsvector('english', content) @@ websearch_to_tsquery('english', ${q})
    ${tagFilter}
    ORDER BY rank DESC, created_at DESC
    LIMIT ${limit}
  `);

  return c.json({ results: rows, query: q });
});

// ─── GET /v1/woa/thread/:hash — load OP + all replies ──────────────────────

woaApp.get('/thread/:hash', async (c) => {
  const hash = c.req.param('hash');

  // Get the OP
  const [op] = await db
    .select()
    .from(woaPosts)
    .where(eq(woaPosts.hash, hash))
    .limit(1);

  if (!op) return c.json({ error: 'Thread not found' }, 404);

  // Get all replies that ref this hash
  const replies = await db
    .select()
    .from(woaPosts)
    .where(arrayContains(woaPosts.refs, [hash]))
    .orderBy(woaPosts.createdAt);

  return c.json({ op, replies });
});
