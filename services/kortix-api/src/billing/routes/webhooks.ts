import { Hono } from 'hono';
import { config } from '../../config';
import { processStripeWebhook, processRevenueCatWebhook } from '../services/webhooks';

export const webhooksRouter = new Hono();

webhooksRouter.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'Missing stripe-signature header' }, 400);
  if (!config.STRIPE_WEBHOOK_SECRET) return c.json({ error: 'Webhook not configured' }, 500);

  const rawBody = await c.req.text();
  const result = await processStripeWebhook(rawBody, signature);
  return c.json(result);
});

webhooksRouter.post('/revenuecat', async (c) => {
  if (!config.REVENUECAT_WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${config.REVENUECAT_WEBHOOK_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const result = await processRevenueCatWebhook(body);
  return c.json(result);
});
