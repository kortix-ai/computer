import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import {
  createCheckoutSession,
  createInlineCheckout,
  confirmInlineCheckout,
  createPortalSession,
  cancelSubscription,
  reactivateSubscription,
  scheduleDowngrade,
  cancelScheduledChange,
  syncSubscription,
  getCheckoutSessionDetails,
  confirmCheckoutSession,
  getProrationPreview,
} from '../services/subscriptions';
import { resolveAccountId } from '../../shared/resolve-account';

export const subscriptionsRouter = new Hono<AppEnv>();

subscriptionsRouter.post('/create-checkout-session', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const email = c.get('userEmail');
  const body = await c.req.json();

  const result = await createCheckoutSession({
    accountId,
    email,
    tierKey: body.tier_key,
    successUrl: body.success_url,
    cancelUrl: body.cancel_url,
    commitmentType: body.commitment_type,
    locale: body.locale,
  });

  return c.json(result);
});

subscriptionsRouter.post('/create-inline-checkout', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const email = c.get('userEmail');
  const body = await c.req.json();

  const result = await createInlineCheckout({
    accountId,
    email,
    tierKey: body.tier_key,
    billingPeriod: body.billing_period,
    promoCode: body.promo_code,
  });

  return c.json(result);
});

subscriptionsRouter.post('/confirm-inline-checkout', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json();

  const result = await confirmInlineCheckout({
    accountId,
    subscriptionId: body.subscription_id,
    tierKey: body.tier_key,
  });

  return c.json(result);
});

subscriptionsRouter.post('/create-portal-session', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json();
  const result = await createPortalSession(accountId, body.return_url);
  return c.json(result);
});

subscriptionsRouter.post('/cancel-subscription', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json().catch(() => ({}));
  const result = await cancelSubscription(accountId, body.feedback);
  return c.json(result);
});

subscriptionsRouter.post('/reactivate-subscription', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const result = await reactivateSubscription(accountId);
  return c.json(result);
});

subscriptionsRouter.post('/schedule-downgrade', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json();
  const result = await scheduleDowngrade(accountId, body.target_tier_key, body.commitment_type);
  return c.json(result);
});

subscriptionsRouter.post('/cancel-scheduled-change', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const result = await cancelScheduledChange(accountId);
  return c.json(result);
});

subscriptionsRouter.post('/sync-subscription', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const result = await syncSubscription(accountId);
  return c.json(result);
});

subscriptionsRouter.get('/proration-preview', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const newPriceId = c.req.query('new_price_id');
  if (!newPriceId) return c.json({ error: 'new_price_id required' }, 400);

  const result = await getProrationPreview(accountId, newPriceId);
  return c.json(result);
});

subscriptionsRouter.get('/checkout-session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const result = await getCheckoutSessionDetails(sessionId);
  return c.json(result);
});

subscriptionsRouter.post('/confirm-checkout-session', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json<{ session_id?: string }>();
  if (!body.session_id) return c.json({ error: 'session_id required' }, 400);

  const result = await confirmCheckoutSession({
    accountId,
    sessionId: body.session_id,
  });

  return c.json(result);
});
