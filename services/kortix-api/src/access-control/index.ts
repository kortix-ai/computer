import { Hono } from 'hono';
import { db } from '../shared/db';
import { accessRequests } from '@kortix/db';
import { areSignupsEnabled, canSignUp } from '../shared/access-control-cache';

export const accessControlApp = new Hono();

accessControlApp.get('/signup-status', (c) => {
  return c.json({ signupsEnabled: areSignupsEnabled() });
});

accessControlApp.post('/check-email', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email) return c.json({ error: 'email required' }, 400);
  return c.json({ allowed: canSignUp(email) });
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
