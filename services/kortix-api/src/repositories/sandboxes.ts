import { eq, and } from 'drizzle-orm';
import { sandboxes } from '@kortix/db';
import { db } from '../db';

export interface SandboxTokenResult {
  isValid: boolean;
  accountId?: string;
  sandboxId?: string;
  error?: string;
}

/**
 * Validate a sandbox token (sbt_xxx format).
 * Looks up kortix.sandboxes by auth_token, returns the account_id if active.
 */
export async function validateSandboxToken(token: string): Promise<SandboxTokenResult> {
  try {
    const [row] = await db
      .select({
        sandboxId: sandboxes.sandboxId,
        accountId: sandboxes.accountId,
        status: sandboxes.status,
      })
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.authToken, token),
          eq(sandboxes.status, 'active'),
        )
      )
      .limit(1);

    if (!row) {
      return { isValid: false, error: 'Sandbox token not found or sandbox inactive' };
    }

    return {
      isValid: true,
      accountId: row.accountId,
      sandboxId: row.sandboxId,
    };
  } catch (err) {
    console.error('Sandbox token validation error:', err);
    return { isValid: false, error: 'Validation error' };
  }
}
