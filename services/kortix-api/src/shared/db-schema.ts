import {
  pgTable,
  pgSchema,
  uuid,
  numeric,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  bigint,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const basejump = pgSchema('basejump');

export const creditAccounts = pgTable('credit_accounts', {
  accountId: uuid('account_id').primaryKey().notNull(),
  balance: numeric({ precision: 12, scale: 4 }).default('0').notNull(),
  lifetimeGranted: numeric('lifetime_granted', { precision: 12, scale: 4 }).default('0').notNull(),
  lifetimePurchased: numeric('lifetime_purchased', { precision: 12, scale: 4 }).default('0').notNull(),
  lifetimeUsed: numeric('lifetime_used', { precision: 12, scale: 4 }).default('0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  lastGrantDate: timestamp('last_grant_date', { withTimezone: true, mode: 'string' }),
  tier: varchar({ length: 50 }).default('free'),
  billingCycleAnchor: timestamp('billing_cycle_anchor', { withTimezone: true, mode: 'string' }),
  nextCreditGrant: timestamp('next_credit_grant', { withTimezone: true, mode: 'string' }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  expiringCredits: numeric('expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
  nonExpiringCredits: numeric('non_expiring_credits', { precision: 12, scale: 4 }).default('0').notNull(),
  trialStatus: varchar('trial_status', { length: 20 }).default('none'),
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true, mode: 'string' }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'string' }),
  isGrandfatheredFree: boolean('is_grandfathered_free').default(false),
  lastProcessedInvoiceId: varchar('last_processed_invoice_id', { length: 255 }),
  commitmentType: varchar('commitment_type', { length: 50 }),
  commitmentStartDate: timestamp('commitment_start_date', { withTimezone: true, mode: 'string' }),
  commitmentEndDate: timestamp('commitment_end_date', { withTimezone: true, mode: 'string' }),
  commitmentPriceId: varchar('commitment_price_id', { length: 255 }),
  canCancelAfter: timestamp('can_cancel_after', { withTimezone: true, mode: 'string' }),
  lastRenewalPeriodStart: bigint('last_renewal_period_start', { mode: 'number' }),
  paymentStatus: text('payment_status').default('active'),
  lastPaymentFailure: timestamp('last_payment_failure', { withTimezone: true, mode: 'string' }),
  scheduledTierChange: text('scheduled_tier_change'),
  scheduledTierChangeDate: timestamp('scheduled_tier_change_date', { withTimezone: true, mode: 'string' }),
  scheduledPriceId: text('scheduled_price_id'),
  provider: varchar({ length: 20 }).default('stripe'),
  revenuecatCustomerId: varchar('revenuecat_customer_id', { length: 255 }),
  revenuecatSubscriptionId: varchar('revenuecat_subscription_id', { length: 255 }),
  revenuecatCancelledAt: timestamp('revenuecat_cancelled_at', { withTimezone: true, mode: 'string' }),
  revenuecatCancelAtPeriodEnd: timestamp('revenuecat_cancel_at_period_end', { withTimezone: true, mode: 'string' }),
  revenuecatPendingChangeProduct: text('revenuecat_pending_change_product'),
  revenuecatPendingChangeDate: timestamp('revenuecat_pending_change_date', { withTimezone: true, mode: 'string' }),
  revenuecatPendingChangeType: text('revenuecat_pending_change_type'),
  revenuecatProductId: text('revenuecat_product_id'),
  planType: varchar('plan_type', { length: 50 }).default('monthly'),
  stripeSubscriptionStatus: varchar('stripe_subscription_status', { length: 50 }),
  lastDailyRefresh: timestamp('last_daily_refresh', { withTimezone: true, mode: 'string' }),
  dailyCreditsBalance: numeric('daily_credits_balance', { precision: 10, scale: 2 }).default('0').notNull(),
});

export const billingCustomers = basejump.table('billing_customers', {
  accountId: uuid('account_id').notNull(),
  id: text().primaryKey().notNull(),
  email: text(),
  active: boolean(),
  provider: text(),
});

// ─── credit_ledger ──────────────────────────────────────────────────────────

export const creditLedger = pgTable('credit_ledger', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amount: numeric({ precision: 12, scale: 4 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),
  type: text().notNull(),
  description: text(),
  referenceId: uuid('reference_id'),
  referenceType: text('reference_type'),
  metadata: jsonb().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  createdBy: uuid('created_by'),
  isExpiring: boolean('is_expiring').default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
  stripeEventId: varchar('stripe_event_id', { length: 255 }),
  messageId: uuid('message_id'),
  threadId: uuid('thread_id'),
}, (table) => [
  unique('unique_stripe_event').on(table.stripeEventId),
]);

// ─── credit_usage ───────────────────────────────────────────────────────────

export const creditUsage = pgTable('credit_usage', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amountDollars: numeric('amount_dollars', { precision: 10, scale: 2 }).notNull(),
  threadId: uuid('thread_id'),
  messageId: uuid('message_id'),
  description: text(),
  usageType: text('usage_type').default('token_overage'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  subscriptionTier: text('subscription_tier'),
  metadata: jsonb().default({}),
});

// ─── account_deletion_requests ──────────────────────────────────────────────

export const accountDeletionRequests = pgTable('account_deletion_requests', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text().default('pending').notNull(), // pending, completed, cancelled
  reason: text(),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
});

// ─── credit_purchases ──────────────────────────────────────────────────────

export const creditPurchases = pgTable('credit_purchases', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  accountId: uuid('account_id').notNull(),
  amountDollars: numeric('amount_dollars', { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  status: text().default('pending').notNull(),
  description: text(),
  metadata: jsonb().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  provider: varchar({ length: 50 }).default('stripe'),
  revenuecatTransactionId: varchar('revenuecat_transaction_id', { length: 255 }),
  revenuecatProductId: varchar('revenuecat_product_id', { length: 255 }),
});
