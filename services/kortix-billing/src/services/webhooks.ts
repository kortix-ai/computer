import Stripe from 'stripe';
import { getStripe } from '../lib/stripe';
import { config } from '../config';
import { WebhookError } from '../errors';
import {
  getCreditAccount,
  updateCreditAccount,
  upsertCreditAccount,
} from '../repositories/credit-accounts';
import { getCustomerByStripeId, upsertCustomer } from '../repositories/customers';
import { insertLedgerEntry } from '../repositories/transactions';
import { updatePurchaseStatus, getPurchaseByPaymentIntent } from '../repositories/transactions';
import {
  getTier,
  getTierByPriceId,
  getMonthlyCredits,
  isUpgrade,
  mapRevenueCatProductToTier,
  getRevenueCatPeriodType,
  isRevenueCatAnonymous,
} from './tiers';
import { grantCredits, resetExpiringCredits } from './credits';

// ─── Stripe Webhook Processing ──────────────────────────────────────────────

export async function processStripeWebhook(rawBody: string, signature: string) {
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw new WebhookError(`Signature verification failed: ${(err as Error).message}`);
  }

  console.log(`[Webhook] Processing ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case 'invoice.payment_succeeded':
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoiceFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  return { received: true, event_type: event.type };
}

// ─── Checkout Completed ─────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const accountId = session.metadata?.account_id;
  if (!accountId) {
    console.warn('[Webhook] checkout.session.completed missing account_id');
    return;
  }

  if (session.mode === 'payment') {
    await handleCreditPurchase(session, accountId);
    return;
  }

  if (session.mode === 'subscription') {
    await handleSubscriptionCheckout(session, accountId);
  }
}

async function handleCreditPurchase(session: Stripe.Checkout.Session, accountId: string) {
  const amountTotal = (session.amount_total ?? 0) / 100;
  if (amountTotal <= 0) return;

  await grantCredits(
    accountId,
    amountTotal,
    'purchase',
    `Credit purchase: $${amountTotal.toFixed(2)}`,
    false,
    session.id,
  );

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  if (paymentIntentId) {
    const purchase = await getPurchaseByPaymentIntent(paymentIntentId);
    if (purchase) {
      await updatePurchaseStatus(purchase.id, 'completed', new Date().toISOString());
    }
  }

  console.log(`[Webhook] Credit purchase: $${amountTotal} for ${accountId}`);
}

async function handleSubscriptionCheckout(session: Stripe.Checkout.Session, accountId: string) {
  const tierKey = session.metadata?.tier_key;
  if (!tierKey) return;

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;
  if (!subscriptionId) return;

  const tier = getTier(tierKey);
  const commitmentType = session.metadata?.commitment_type;

  await upsertCreditAccount(accountId, {
    tier: tierKey,
    provider: 'stripe',
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: 'active',
    planType: commitmentType === 'yearly' || commitmentType === 'yearly_commitment' ? 'yearly' : 'monthly',
    commitmentType: commitmentType === 'yearly_commitment' ? commitmentType : null,
  });

  if (tier.monthlyCredits > 0) {
    await grantCredits(
      accountId,
      tier.monthlyCredits,
      'tier_grant',
      `${tier.displayName} subscription activated: ${tier.monthlyCredits} credits`,
      true,
      session.id,
    );
  }

  if (session.customer) {
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
    await upsertCustomer({
      accountId,
      id: customerId,
      email: session.customer_email ?? null,
      provider: 'stripe',
      active: true,
    });
  }

  console.log(`[Webhook] Subscription checkout: ${tierKey} for ${accountId}`);
}

// ─── Subscription Changes ───────────────────────────────────────────────────

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const accountId = subscription.metadata?.account_id;
  if (!accountId) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    if (!customerId) {
      console.warn('[Webhook] subscription change: no account_id or customer_id');
      return;
    }

    const customer = await getCustomerByStripeId(customerId);
    if (!customer) {
      console.warn(`[Webhook] subscription change: no billing customer for stripe_id=${customerId}`);
      return;
    }

    await syncSubscriptionState(customer.accountId, subscription);
    return;
  }

  await syncSubscriptionState(accountId, subscription);
}

async function syncSubscriptionState(accountId: string, subscription: Stripe.Subscription) {
  const tierKey = subscription.metadata?.tier_key;
  const priceId = subscription.items.data[0]?.price?.id;
  const resolvedTier = tierKey ?? getTierByPriceId(priceId ?? '')?.name ?? null;

  console.log(`[Webhook] syncSubscriptionState: account=${accountId} tier_meta=${tierKey} price=${priceId} resolved=${resolvedTier} status=${subscription.status}`);

  const updates: Record<string, any> = {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    billingCycleAnchor: new Date(subscription.billing_cycle_anchor * 1000).toISOString(),
  };

  if (resolvedTier) {
    updates.tier = resolvedTier;
  }

  if (subscription.cancel_at_period_end) {
    updates.paymentStatus = 'cancelling';
  } else if (subscription.status === 'active') {
    updates.paymentStatus = 'active';
  }

  await updateCreditAccount(accountId, updates);
}

// ─── Subscription Deleted ───────────────────────────────────────────────────

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const accountId = subscription.metadata?.account_id;
  if (!accountId) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    if (!customerId) return;

    const customer = await getCustomerByStripeId(customerId);
    if (!customer) return;

    await revertToFree(customer.accountId);
    return;
  }

  await revertToFree(accountId);
}

async function revertToFree(accountId: string) {
  await updateCreditAccount(accountId, {
    tier: 'free',
    stripeSubscriptionStatus: 'canceled',
    scheduledTierChange: null,
    scheduledTierChangeDate: null,
    scheduledPriceId: null,
    commitmentType: null,
    commitmentEndDate: null,
    paymentStatus: 'active',
  });

  console.log(`[Webhook] Subscription cancelled, reverted to free: ${accountId}`);
}

// ─── Invoice Paid (Renewal) ─────────────────────────────────────────────────

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subscriptionId) return;

  const billingReason = invoice.billing_reason;
  if (billingReason !== 'subscription_cycle') return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const accountId = subscription.metadata?.account_id;
  if (!accountId) return;

  const account = await getCreditAccount(accountId);
  if (!account) return;

  const periodStart = invoice.period_start;
  if (account.lastRenewalPeriodStart && account.lastRenewalPeriodStart >= periodStart) {
    console.log(`[Webhook] Renewal already processed for period ${periodStart}`);
    return;
  }

  if (account.scheduledTierChange) {
    await applyScheduledDowngrade(accountId, account.scheduledTierChange);
  }

  const tierName = account.scheduledTierChange ?? account.tier ?? 'free';
  const credits = getMonthlyCredits(tierName);

  if (credits > 0) {
    await resetExpiringCredits(accountId, credits);

    await insertLedgerEntry({
      accountId,
      amount: String(credits),
      balanceAfter: '0',
      type: 'tier_grant',
      description: `Monthly renewal: ${credits} credits`,
      isExpiring: true,
      stripeEventId: invoice.id,
    });
  }

  await updateCreditAccount(accountId, {
    lastRenewalPeriodStart: periodStart,
    lastProcessedInvoiceId: invoice.id,
    lastGrantDate: new Date().toISOString(),
    nextCreditGrant: new Date(subscription.current_period_end * 1000).toISOString(),
  });

  console.log(`[Webhook] Renewal processed: ${credits} credits for ${accountId}`);
}

async function applyScheduledDowngrade(accountId: string, targetTier: string) {
  const tier = getTier(targetTier);

  await updateCreditAccount(accountId, {
    tier: targetTier,
    scheduledTierChange: null,
    scheduledTierChangeDate: null,
    scheduledPriceId: null,
  });

  console.log(`[Webhook] Applied scheduled downgrade to ${tier.displayName} for ${accountId}`);
}

// ─── Invoice Failed ─────────────────────────────────────────────────────────

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subscriptionId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const accountId = subscription.metadata?.account_id;
  if (!accountId) return;

  await updateCreditAccount(accountId, {
    paymentStatus: 'past_due',
    lastPaymentFailure: new Date().toISOString(),
  });

  console.log(`[Webhook] Payment failed for ${accountId}`);
}

// ─── RevenueCat Webhook Processing ──────────────────────────────────────────

export async function processRevenueCatWebhook(body: any) {
  const event = body?.event;
  if (!event) throw new WebhookError('Missing event in RevenueCat webhook');

  const eventType = event.type;
  const appUserId = event.app_user_id;
  if (!appUserId) throw new WebhookError('Missing app_user_id');

  if (isRevenueCatAnonymous(appUserId)) {
    console.log(`[RevenueCat] Skipping anonymous user: ${appUserId}`);
    return { received: true, event_type: eventType, skipped: true };
  }

  console.log(`[RevenueCat] Processing ${eventType} for ${appUserId}`);

  switch (eventType) {
    case 'INITIAL_PURCHASE':
      await handleRevenueCatPurchase(appUserId, event);
      break;

    case 'RENEWAL':
      await handleRevenueCatRenewal(appUserId, event);
      break;

    case 'CANCELLATION':
    case 'EXPIRATION':
      await handleRevenueCatCancellation(appUserId, event);
      break;

    case 'UNCANCELLATION':
      await handleRevenueCatUncancellation(appUserId, event);
      break;

    case 'PRODUCT_CHANGE':
      await handleRevenueCatProductChange(appUserId, event);
      break;

    case 'NON_RENEWING_PURCHASE':
      await handleRevenueCatTopup(appUserId, event);
      break;

    case 'SUBSCRIPTION_PAUSED':
    case 'BILLING_ISSUE':
      await handleRevenueCatBillingIssue(appUserId, event);
      break;

    default:
      console.log(`[RevenueCat] Unhandled event type: ${eventType}`);
  }

  return { received: true, event_type: eventType };
}

async function handleRevenueCatPurchase(accountId: string, event: any) {
  const productId = event.product_id;
  const tierKey = mapRevenueCatProductToTier(productId);
  if (!tierKey) {
    console.warn(`[RevenueCat] Unknown product ID: ${productId}`);
    return;
  }

  const tier = getTier(tierKey);
  const periodType = getRevenueCatPeriodType(productId);

  await upsertCreditAccount(accountId, {
    tier: tierKey,
    provider: 'revenuecat',
    planType: periodType === 'yearly_commitment' ? 'yearly' : periodType,
    revenuecatProductId: productId,
    revenuecatCustomerId: event.subscriber_id ?? null,
  });

  if (tier.monthlyCredits > 0) {
    await grantCredits(
      accountId,
      tier.monthlyCredits,
      'tier_grant',
      `${tier.displayName} subscription (mobile): ${tier.monthlyCredits} credits`,
      true,
    );
  }

  console.log(`[RevenueCat] Initial purchase: ${tierKey} for ${accountId}`);
}

async function handleRevenueCatRenewal(accountId: string, event: any) {
  const account = await getCreditAccount(accountId);
  if (!account) return;

  const tierName = account.tier ?? 'free';
  const credits = getMonthlyCredits(tierName);

  if (credits > 0) {
    await resetExpiringCredits(accountId, credits);

    await insertLedgerEntry({
      accountId,
      amount: String(credits),
      balanceAfter: '0',
      type: 'tier_grant',
      description: `Mobile renewal: ${credits} credits`,
      isExpiring: true,
    });
  }

  await updateCreditAccount(accountId, {
    lastGrantDate: new Date().toISOString(),
  });

  console.log(`[RevenueCat] Renewal: ${credits} credits for ${accountId}`);
}

async function handleRevenueCatCancellation(accountId: string, event: any) {
  const expirationDate = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  await updateCreditAccount(accountId, {
    revenuecatCancelledAt: new Date().toISOString(),
    revenuecatCancelAtPeriodEnd: expirationDate,
  });

  if (event.type === 'EXPIRATION') {
    await updateCreditAccount(accountId, {
      tier: 'free',
      revenuecatProductId: null,
    });
  }

  console.log(`[RevenueCat] ${event.type}: ${accountId}`);
}

async function handleRevenueCatUncancellation(accountId: string, _event: any) {
  await updateCreditAccount(accountId, {
    revenuecatCancelledAt: null,
    revenuecatCancelAtPeriodEnd: null,
  });

  console.log(`[RevenueCat] Uncancellation: ${accountId}`);
}

async function handleRevenueCatProductChange(accountId: string, event: any) {
  const newProductId = event.new_product_id;
  const effectiveDate = event.effective_date
    ? new Date(event.effective_date).toISOString()
    : null;

  if (effectiveDate) {
    await updateCreditAccount(accountId, {
      revenuecatPendingChangeProduct: newProductId,
      revenuecatPendingChangeDate: effectiveDate,
      revenuecatPendingChangeType: 'product_change',
    });
  } else {
    const tierKey = mapRevenueCatProductToTier(newProductId);
    if (tierKey) {
      await updateCreditAccount(accountId, {
        tier: tierKey,
        revenuecatProductId: newProductId,
        revenuecatPendingChangeProduct: null,
        revenuecatPendingChangeDate: null,
        revenuecatPendingChangeType: null,
      });
    }
  }

  console.log(`[RevenueCat] Product change: ${accountId}`);
}

async function handleRevenueCatTopup(accountId: string, event: any) {
  const price = event.price ? Number(event.price) : 0;
  if (price <= 0) return;

  await grantCredits(
    accountId,
    price,
    'purchase',
    `Mobile credit purchase: $${price.toFixed(2)}`,
    false,
  );

  console.log(`[RevenueCat] Top-up: $${price} for ${accountId}`);
}

async function handleRevenueCatBillingIssue(accountId: string, event: any) {
  await updateCreditAccount(accountId, {
    paymentStatus: 'past_due',
    lastPaymentFailure: new Date().toISOString(),
  });

  console.log(`[RevenueCat] Billing issue: ${accountId}`);
}

