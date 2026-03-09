/**
 * Re-export billing/public schema tables from the shared @kortix/db package.
 * This file exists for backward compatibility — new code should import directly
 * from '@kortix/db'.
 */
export {
  creditAccounts,
  creditLedger,
  creditUsage,
  accountDeletionRequests,
  creditPurchases,
  billingCustomers,
} from '@kortix/db';
