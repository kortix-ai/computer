import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { db } from '../shared/db';
import { platformUserRoles } from '@kortix/db';

export async function requireAdmin(c: Context, next: Next) {
  const accountId = c.get('userId') as string | undefined;
  if (!accountId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const [row] = await db
    .select({ role: platformUserRoles.role })
    .from(platformUserRoles)
    .where(eq(platformUserRoles.accountId, accountId))
    .limit(1);

  if (!row || (row.role !== 'admin' && row.role !== 'super_admin')) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }

  c.set('platformRole', row.role);
  await next();
}
