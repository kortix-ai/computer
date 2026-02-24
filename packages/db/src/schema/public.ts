import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// NOTE: Credit/billing tables (creditAccounts, creditLedger, creditUsage,
// creditPurchases, accountDeletionRequests) have been moved to kortix.ts
// under the 'kortix' schema. Do NOT re-add them here.

// ─── Basejump schema (read-only reference — NOT pushed by drizzle-kit) ──────
const basejump = pgSchema('basejump');

export const accountUser = basejump.table(
  'account_user',
  {
    userId: uuid('user_id').notNull(),
    accountId: uuid('account_id').notNull(),
    accountRole: text('account_role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.accountId] }),
    index('idx_account_user_user_id').on(table.userId),
    index('idx_account_user_account_id').on(table.accountId),
  ],
);

export const billingCustomers = basejump.table('billing_customers', {
  accountId: uuid('account_id').notNull(),
  id: text().primaryKey().notNull(),
  email: text(),
  active: boolean(),
  provider: text(),
});

// ─── Public schema tables ───────────────────────────────────────────────────
// These are pushed by drizzle-kit (schemaFilter includes 'public').

export const apiKeys = pgTable(
  'api_keys',
  {
    keyId: uuid('key_id').defaultRandom().primaryKey().notNull(),
    publicKey: varchar('public_key', { length: 64 }).notNull(),
    secretKeyHash: varchar('secret_key_hash', { length: 64 }).notNull(),
    accountId: uuid('account_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: text('status').default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_api_keys_account_id').on(table.accountId),
    index('idx_api_keys_public_key').on(table.publicKey),
  ],
);


