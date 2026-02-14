import { eq } from 'drizzle-orm';
import { billingCustomers } from '../../shared/db-schema';
import { db } from '../../shared/db';

export async function getCustomerByAccountId(accountId: string) {
  const [row] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.accountId, accountId))
    .limit(1);

  return row ?? null;
}

export async function getCustomerByStripeId(stripeCustomerId: string) {
  const [row] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.id, stripeCustomerId))
    .limit(1);

  return row ?? null;
}

export async function upsertCustomer(data: {
  accountId: string;
  id: string;
  email?: string | null;
  provider?: string | null;
  active?: boolean | null;
}) {
  await db
    .insert(billingCustomers)
    .values(data)
    .onConflictDoUpdate({
      target: billingCustomers.id,
      set: {
        email: data.email,
        active: data.active,
        provider: data.provider,
      },
    });
}
