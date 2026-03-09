/**
 * Shared account resolution: userId → accountId.
 *
 * Resolution order:
 *   1. kortix.account_members (new, native)
 *   2. basejump.account_user  (legacy read-only fallback for cloud prod)
 *   3. Auto-create personal account if neither table has a row
 *
 * The basejump fallback is read-only — no data is copied into kortix tables.
 * A manual migration will move basejump data to kortix later.
 */

import { eq } from 'drizzle-orm';
import { accounts, accountMembers, accountUser } from '@kortix/db';
import { db } from './db';

export async function resolveAccountId(userId: string): Promise<string> {
  // 1. Try kortix.account_members (new table)
  try {
    const [membership] = await db
      .select({ accountId: accountMembers.accountId })
      .from(accountMembers)
      .where(eq(accountMembers.userId, userId))
      .limit(1);

    if (membership) return membership.accountId;
  } catch {
    // Table may not exist yet (first boot before schema push)
  }

  // 2. Read-only fallback to basejump.account_user (cloud prod)
  try {
    const [legacy] = await db
      .select({ accountId: accountUser.accountId })
      .from(accountUser)
      .where(eq(accountUser.userId, userId))
      .limit(1);

    if (legacy) return legacy.accountId;
  } catch {
    // basejump schema doesn't exist (self-hosted)
  }

  // 3. No membership anywhere — auto-create personal account in kortix
  try {
    await db.insert(accounts).values({
      accountId: userId,
      name: 'Personal',
      personalAccount: true,
    }).onConflictDoNothing();

    await db.insert(accountMembers).values({
      userId,
      accountId: userId,
      accountRole: 'owner',
    }).onConflictDoNothing();
  } catch {
    // Tables may not exist yet
  }

  return userId;
}
