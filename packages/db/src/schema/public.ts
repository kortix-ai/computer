import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  timestamp,
  bigint,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// ─── Basejump schema (read-only reference) ──────────────────────────────────
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

// ─── Public schema tables (read-only reference for services) ────────────────

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

export const creditAccounts = pgTable(
  'credit_accounts',
  {
    accountId: uuid('account_id').primaryKey().notNull(),
    balance: numeric('balance', { precision: 12, scale: 4 }).default('0').notNull(),
    expiringCredits: numeric('expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
    nonExpiringCredits: numeric('non_expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
    dailyCreditsBalance: numeric('daily_credits_balance', { precision: 10, scale: 2 }).default('0').notNull(),
    tier: varchar('tier', { length: 50 }).default('free'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_credit_accounts_account_id').on(table.accountId),
  ],
);
