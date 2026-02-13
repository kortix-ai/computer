import { getStripe } from '../lib/stripe';
import {
  getCreditAccount,
  updateCreditAccount,
  upsertCreditAccount,
} from '../repositories/credit-accounts';
import { getCustomerByAccountId, upsertCustomer } from '../repositories/customers';
import { BillingError, SubscriptionError } from '../errors';
import { getTier, isUpgrade, isDowngrade, getMonthlyCredits, resolvePriceId } from './tiers';
import { grantCredits, resetExpiringCredits } from './credits';

export async function getOrCreateStripeCustomer(
  accountId: string,
  email: string,
): Promise<string> {
  const existing = await getCustomerByAccountId(accountId);
  if (existing) return existing.id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { account_id: accountId },
  });

  await upsertCustomer({
    accountId,
    id: customer.id,
    email,
    provider: 'stripe',
    active: true,
  });

  return customer.id;
}

export async function createCheckoutSession(params: {
  accountId: string;
  email: string;
  tierKey: string;
  successUrl: string;
  cancelUrl: string;
  commitmentType?: string;
  locale?: string;
}) {
  const { accountId, email, tierKey, successUrl, cancelUrl, commitmentType, locale } = params;
  const tier = getTier(tierKey);
  if (tier.name === 'none') throw new BillingError('Invalid tier');

  const account = await getCreditAccount(accountId);
  const currentTier = account?.tier ?? 'free';

  if (currentTier === tierKey) {
    return { status: 'no_change' as const, message: 'Already on this tier' };
  }

  if (account?.stripeSubscriptionId && currentTier !== 'free' && isUpgrade(currentTier, tierKey)) {
    return handleUpgrade(accountId, account.stripeSubscriptionId, tierKey, commitmentType);
  }

  if (account?.stripeSubscriptionId && isDowngrade(currentTier, tierKey)) {
    return scheduleDowngrade(accountId, tierKey, commitmentType);
  }

  const customerId = await getOrCreateStripeCustomer(accountId, email);
  const stripe = getStripe();

  const priceId = resolvePriceId(tierKey, commitmentType);
  if (!priceId) throw new BillingError('No price configured for this tier');

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        account_id: accountId,
        tier_key: tierKey,
        commitment_type: commitmentType ?? 'monthly',
      },
    },
    metadata: {
      account_id: accountId,
      tier_key: tierKey,
    },
    ...(locale ? { locale: locale as any } : {}),
  });

  return {
    status: 'checkout_created' as const,
    checkout_url: session.url,
    session_id: session.id,
  };
}

export async function createInlineCheckout(params: {
  accountId: string;
  email: string;
  tierKey: string;
  billingPeriod: 'monthly' | 'yearly';
  promoCode?: string;
}) {
  const { accountId, email, tierKey, billingPeriod, promoCode } = params;
  const tier = getTier(tierKey);
  if (tier.name === 'none') throw new BillingError('Invalid tier');

  const account = await getCreditAccount(accountId);
  const currentTier = account?.tier ?? 'free';

  if (account?.stripeSubscriptionId && isUpgrade(currentTier, tierKey)) {
    return handleUpgrade(accountId, account.stripeSubscriptionId, tierKey, billingPeriod);
  }

  const customerId = await getOrCreateStripeCustomer(accountId, email);
  const stripe = getStripe();

  const priceId = resolvePriceId(tierKey, billingPeriod);
  if (!priceId) throw new BillingError('No price configured for this tier/period');

  const subscriptionParams: any = {
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      account_id: accountId,
      tier_key: tierKey,
      billing_period: billingPeriod,
    },
  };

  if (promoCode) {
    const promos = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
    if (promos.data.length > 0) {
      subscriptionParams.promotion_code = promos.data[0].id;
    }
  }

  const subscription = await stripe.subscriptions.create(subscriptionParams);
  const invoice = subscription.latest_invoice as any;
  const paymentIntent = invoice?.payment_intent as any;

  if (invoice?.amount_due === 0) {
    await activateSubscription(accountId, subscription.id, tierKey, billingPeriod);
    return {
      subscription_id: subscription.id,
      tier_key: tierKey,
      no_payment_required: true,
    };
  }

  return {
    client_secret: paymentIntent?.client_secret ?? null,
    subscription_id: subscription.id,
    tier_key: tierKey,
    amount: invoice?.amount_due,
    currency: invoice?.currency,
  };
}

export async function confirmInlineCheckout(params: {
  accountId: string;
  subscriptionId: string;
  tierKey: string;
}) {
  const { accountId, subscriptionId, tierKey } = params;
  const stripe = getStripe();

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    throw new SubscriptionError('Subscription is not active');
  }

  const billingPeriod = (subscription.metadata?.billing_period ?? 'monthly') as string;
  await activateSubscription(accountId, subscriptionId, tierKey, billingPeriod);

  return { success: true, tier: tierKey, message: 'Subscription activated' };
}

export async function createPortalSession(accountId: string, returnUrl: string) {
  const customer = await getCustomerByAccountId(accountId);
  if (!customer) throw new BillingError('No billing customer found');

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: returnUrl,
  });

  return { portal_url: session.url };
}

export async function cancelSubscription(accountId: string, feedback?: string) {
  const account = await getCreditAccount(accountId);
  if (!account?.stripeSubscriptionId) throw new SubscriptionError('No active subscription');

  if (account.commitmentType && account.commitmentEndDate) {
    const commitmentEnd = new Date(account.commitmentEndDate);
    if (commitmentEnd > new Date()) {
      throw new SubscriptionError('Cannot cancel during commitment period');
    }
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.update(account.stripeSubscriptionId, {
    cancel_at_period_end: true,
    metadata: { cancellation_feedback: feedback ?? '' },
  });

  return {
    success: true,
    cancel_at: subscription.cancel_at,
    message: 'Subscription will cancel at end of billing period',
  };
}

export async function reactivateSubscription(accountId: string) {
  const account = await getCreditAccount(accountId);
  if (!account?.stripeSubscriptionId) throw new SubscriptionError('No subscription to reactivate');

  const stripe = getStripe();
  await stripe.subscriptions.update(account.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  return { success: true, message: 'Subscription reactivated' };
}

export async function scheduleDowngrade(
  accountId: string,
  targetTierKey: string,
  commitmentType?: string,
) {
  const account = await getCreditAccount(accountId);
  if (!account?.stripeSubscriptionId) throw new SubscriptionError('No active subscription');

  const currentTier = getTier(account.tier ?? 'free');
  const targetTier = getTier(targetTierKey);

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(account.stripeSubscriptionId);
  const effectiveDate = new Date(subscription.current_period_end * 1000).toISOString();

  await updateCreditAccount(accountId, {
    scheduledTierChange: targetTierKey,
    scheduledTierChangeDate: effectiveDate,
  });

  return {
    success: true,
    message: `Downgrade to ${targetTier.displayName} scheduled`,
    scheduled_date: effectiveDate,
    current_tier: {
      name: currentTier.name,
      display_name: currentTier.displayName,
      monthly_credits: currentTier.monthlyCredits,
    },
    target_tier: {
      name: targetTier.name,
      display_name: targetTier.displayName,
      monthly_credits: targetTier.monthlyCredits,
    },
    billing_change: true,
    current_billing_period: account.planType ?? 'monthly',
    target_billing_period: commitmentType ?? 'monthly',
    change_description: `Your plan will change from ${currentTier.displayName} to ${targetTier.displayName} at the end of your billing period.`,
  };
}

export async function cancelScheduledChange(accountId: string) {
  await updateCreditAccount(accountId, {
    scheduledTierChange: null,
    scheduledTierChangeDate: null,
    scheduledPriceId: null,
  });

  return { success: true, message: 'Scheduled change cancelled' };
}

export async function syncSubscription(accountId: string) {
  const account = await getCreditAccount(accountId);
  if (!account?.stripeSubscriptionId) {
    return { success: true, message: 'No subscription to sync' };
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(account.stripeSubscriptionId);

  await updateCreditAccount(accountId, {
    stripeSubscriptionStatus: subscription.status,
    billingCycleAnchor: new Date(subscription.billing_cycle_anchor * 1000).toISOString(),
  });

  return { success: true, message: 'Subscription synced' };
}

export async function getCheckoutSessionDetails(sessionId: string) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['total_details.breakdown'],
  });

  const discount = session.total_details?.breakdown?.discounts?.[0];

  return {
    session_id: session.id,
    amount_total: session.amount_total ?? 0,
    amount_subtotal: session.amount_subtotal ?? 0,
    amount_discount: discount?.amount ?? 0,
    amount_tax: session.total_details?.amount_tax ?? 0,
    currency: session.currency ?? 'usd',
    coupon_id: discount?.discount?.coupon?.id ?? null,
    coupon_name: discount?.discount?.coupon?.name ?? null,
    promotion_code: discount?.discount?.promotion_code
      ? String((discount.discount.promotion_code as any)?.code ?? discount.discount.promotion_code)
      : null,
    balance_transaction_id: (session as any).balance_transaction ?? null,
    status: session.status ?? 'unknown',
    payment_status: session.payment_status ?? 'unknown',
  };
}

export async function getProrationPreview(accountId: string, newPriceId: string) {
  const account = await getCreditAccount(accountId);
  if (!account?.stripeSubscriptionId) throw new SubscriptionError('No active subscription');

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(account.stripeSubscriptionId);

  const invoice = await stripe.invoices.retrieveUpcoming({
    customer: subscription.customer as string,
    subscription: account.stripeSubscriptionId,
    subscription_items: [
      { id: subscription.items.data[0].id, price: newPriceId },
    ],
    subscription_proration_date: Math.floor(Date.now() / 1000),
  });

  return {
    amount_due: invoice.amount_due,
    currency: invoice.currency,
    proration_date: invoice.subscription_proration_date,
  };
}

async function handleUpgrade(
  accountId: string,
  subscriptionId: string,
  targetTierKey: string,
  commitmentType?: string,
) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const newPriceId = resolvePriceId(targetTierKey, commitmentType);
  if (!newPriceId) throw new BillingError('No price for target tier');

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: subscription.items.data[0].id, price: newPriceId }],
    proration_behavior: 'create_prorations',
    metadata: {
      ...subscription.metadata,
      tier_key: targetTierKey,
      previous_tier: subscription.metadata?.tier_key ?? 'unknown',
    },
  });

  await activateSubscription(accountId, subscriptionId, targetTierKey, commitmentType ?? 'monthly');

  const targetTier = getTier(targetTierKey);
  const credits = targetTier.monthlyCredits;
  if (credits > 0) {
    await resetExpiringCredits(accountId, credits);
  }

  return {
    status: 'upgraded' as const,
    subscription_id: updated.id,
    message: `Upgraded to ${targetTier.displayName}`,
  };
}

async function activateSubscription(
  accountId: string,
  subscriptionId: string,
  tierKey: string,
  billingPeriod: string,
) {
  await upsertCreditAccount(accountId, {
    tier: tierKey,
    provider: 'stripe',
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: 'active',
    planType: billingPeriod,
    scheduledTierChange: null,
    scheduledTierChangeDate: null,
    scheduledPriceId: null,
  });
}
