import { Hono } from 'hono';
import postgres from 'postgres';
import { eq, desc, sql as dsql } from 'drizzle-orm';
import { db } from '../shared/db';
import { accessRequests, accessAllowlist } from '@kortix/db';
import { areSignupsEnabled, canSignUp } from '../shared/access-control-cache';
import { config } from '../config';
import { supabaseAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/require-admin';

export const accessControlApp = new Hono();

async function userExistsInAuth(email: string): Promise<boolean> {
  if (!config.DATABASE_URL) return false;
  const sql = postgres(config.DATABASE_URL, { max: 1 });
  try {
    const [row] = await sql`
      SELECT 1 FROM auth.users WHERE email = ${email.trim().toLowerCase()} LIMIT 1
    `;
    return !!row;
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

// ─── Public endpoints ─────────────────────────────────────────────────────────

accessControlApp.get('/signup-status', (c) => {
  return c.json({ signupsEnabled: areSignupsEnabled() });
});

accessControlApp.post('/check-email', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email) return c.json({ error: 'email required' }, 400);

  if (canSignUp(email)) {
    return c.json({ allowed: true });
  }

  if (await userExistsInAuth(email)) {
    return c.json({ allowed: true });
  }

  return c.json({ allowed: false });
});

accessControlApp.post('/request-access', async (c) => {
  const body = await c.req.json<{ email: string; company?: string; useCase?: string }>();
  if (!body.email || !body.email.includes('@')) {
    return c.json({ error: 'valid email required' }, 400);
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  await db.insert(accessRequests).values({
    email: normalizedEmail,
    company: body.company || null,
    useCase: body.useCase || null,
  });

  return c.json({ success: true, message: 'Access request submitted' });
});

// ─── Admin endpoints (require admin role) ─────────────────────────────────────

// GET /v1/access/requests — list all access requests
accessControlApp.get('/requests', supabaseAuth, requireAdmin, async (c) => {
  const status = c.req.query('status'); // optional filter: pending, approved, rejected
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let query = db
    .select()
    .from(accessRequests)
    .orderBy(desc(accessRequests.createdAt))
    .limit(limit)
    .offset(offset);

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.where(eq(accessRequests.status, status as 'pending' | 'approved' | 'rejected'));
  }

  const rows = await query;

  // Get total counts per status
  const counts = await db
    .select({
      status: accessRequests.status,
      count: dsql<number>`count(*)::int`,
    })
    .from(accessRequests)
    .groupBy(accessRequests.status);

  const summary = { pending: 0, approved: 0, rejected: 0 };
  for (const row of counts) {
    summary[row.status] = row.count;
  }

  return c.json({ requests: rows, summary, limit, offset });
});

// POST /v1/access/requests/:id/approve — approve a request and add email to allowlist
accessControlApp.post('/requests/:id/approve', supabaseAuth, requireAdmin, async (c) => {
  const { id } = c.req.param();

  const [request] = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .limit(1);

  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }

  if (request.status !== 'pending') {
    return c.json({ error: `Request already ${request.status}` }, 400);
  }

  // Update status to approved
  await db
    .update(accessRequests)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(eq(accessRequests.id, id));

  // Add email to allowlist so they can sign up
  await db
    .insert(accessAllowlist)
    .values({
      entryType: 'email',
      value: request.email.toLowerCase(),
      note: `Approved from access request ${id}`,
    })
    .onConflictDoNothing();

  return c.json({ success: true, email: request.email });
});

// POST /v1/access/requests/:id/reject — reject a request
accessControlApp.post('/requests/:id/reject', supabaseAuth, requireAdmin, async (c) => {
  const { id } = c.req.param();

  const [request] = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .limit(1);

  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }

  if (request.status !== 'pending') {
    return c.json({ error: `Request already ${request.status}` }, 400);
  }

  await db
    .update(accessRequests)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(eq(accessRequests.id, id));

  return c.json({ success: true, email: request.email });
});
