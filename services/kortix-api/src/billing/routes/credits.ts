import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { deductCredits, calculateTokenCost } from '../services/credits';
import { getVisibleTiers } from '../services/tiers';
import { getCreditBalance } from '../repositories/credit-accounts';
import { getTransactionsSummary } from '../repositories/transactions';
import type { TokenUsageRequest } from '../../types';
import { config } from '../../config';

export const creditsRouter = new Hono<AppEnv>();

creditsRouter.post('/deduct', async (c) => {
  const accountId = c.get('userId');
  const body = await c.req.json<TokenUsageRequest>();

  const cost = calculateTokenCost(body.prompt_tokens, body.completion_tokens, body.model);
  if (cost <= 0) {
    return c.json({ success: true, cost: 0, new_balance: 0 });
  }

  // Local mode: skip real deduction, credits are unlimited
  if (config.isLocal()) {
    return c.json({ success: true, cost, new_balance: 999999 });
  }

  const result = await deductCredits(
    accountId,
    cost,
    `LLM: ${body.model} (${body.prompt_tokens}/${body.completion_tokens} tokens)`,
  );

  return c.json({
    success: result.success,
    cost: result.cost,
    new_balance: result.newBalance,
    transaction_id: result.transactionId,
  });
});

creditsRouter.post('/deduct-usage', async (c) => {
  const accountId = c.get('userId');
  const body = await c.req.json<{ amount: number; description?: string }>();

  if (!body.amount || body.amount <= 0) {
    return c.json({ success: true, cost: 0, new_balance: 0 });
  }

  // Local mode: skip real deduction, credits are unlimited
  if (config.isLocal()) {
    return c.json({ success: true, cost: body.amount, new_balance: 999999 });
  }

  const result = await deductCredits(
    accountId,
    body.amount,
    body.description || `Agent run usage: $${body.amount.toFixed(4)}`,
  );

  return c.json({
    success: result.success,
    cost: result.cost,
    new_balance: result.newBalance,
    transaction_id: result.transactionId,
  });
});

creditsRouter.get('/tier-configurations', async (c) => {
  const tiers = getVisibleTiers().map((t) => ({
    name: t.name,
    display_name: t.displayName,
    monthly_price: t.monthlyPrice,
    yearly_price: t.yearlyPrice,
    monthly_credits: t.monthlyCredits,
    can_purchase_credits: t.canPurchaseCredits,
  }));

  return c.json({ tiers });
});

creditsRouter.get('/credit-breakdown', async (c) => {
  const accountId = c.get('userId');
  const balance = await getCreditBalance(accountId);

  if (!balance) {
    return c.json({ total: 0, expiring: 0, non_expiring: 0, daily: 0 });
  }

  return c.json({
    total: Number(balance.balance),
    expiring: Number(balance.expiringCredits),
    non_expiring: Number(balance.nonExpiringCredits),
    daily: Number(balance.dailyCreditsBalance),
  });
});

creditsRouter.get('/usage-history', async (c) => {
  const accountId = c.get('userId');
  const days = Number(c.req.query('days') ?? 30);
  const summary = await getTransactionsSummary(accountId, days);
  return c.json(summary);
});
