/**
 * Shared account resolution: userId → accountId.
 *
 * In cloud mode, the basejump.account_user table maps Supabase users to
 * their team/personal account.  In **local / self-hosted** mode the basejump
 * schema does not exist, so we short-circuit and treat userId as accountId
 * (they're always the same fixed UUID).
 */

import { eq } from 'drizzle-orm';
import { accountUser } from '@kortix/db';
import { db } from './db';
import { config } from '../config';

/**
 * Resolve the account ID for a given user.
 *
 * - **Local mode**: returns `userId` directly (no basejump schema).
 * - **Cloud mode**: queries `basejump.account_user`; falls back to `userId`
 *   if no membership row is found.
 */
export async function resolveAccountId(userId: string): Promise<string> {
  // Local / self-hosted: basejump schema doesn't exist — skip the query.
  if (config.isLocal()) return userId;

  try {
    const [membership] = await db
      .select({ accountId: accountUser.accountId })
      .from(accountUser)
      .where(eq(accountUser.userId, userId))
      .limit(1);

    return membership?.accountId ?? userId;
  } catch {
    // If basejump.account_user doesn't exist (e.g. fresh self-hosted DB), fall back.
    return userId;
  }
}
