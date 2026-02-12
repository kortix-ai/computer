import { eq } from 'drizzle-orm';
import { creditAccounts } from '@kortix/db';
import { db } from '../db';

export interface CreditBalance {
  balance: number;
  expiringCredits: number;
  nonExpiringCredits: number;
  dailyCreditsBalance: number;
  tier: string;
}

/**
 * Get credit balance for an account.
 */
export async function getCreditBalance(accountId: string): Promise<CreditBalance | null> {
  const [row] = await db
    .select({
      balance: creditAccounts.balance,
      expiringCredits: creditAccounts.expiringCredits,
      nonExpiringCredits: creditAccounts.nonExpiringCredits,
      dailyCreditsBalance: creditAccounts.dailyCreditsBalance,
      tier: creditAccounts.tier,
    })
    .from(creditAccounts)
    .where(eq(creditAccounts.accountId, accountId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    balance: Number(row.balance) || 0,
    expiringCredits: Number(row.expiringCredits) || 0,
    nonExpiringCredits: Number(row.nonExpiringCredits) || 0,
    dailyCreditsBalance: Number(row.dailyCreditsBalance) || 0,
    tier: row.tier || 'none',
  };
}
