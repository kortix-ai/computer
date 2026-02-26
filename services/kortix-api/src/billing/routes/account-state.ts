import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { buildAccountState, buildMinimalAccountState, buildLocalAccountState } from '../services/account-state';
import { hasDatabase } from '../../shared/db';
import { config } from '../../config';

export const accountStateRouter = new Hono<AppEnv>();

accountStateRouter.get('/', async (c) => {
  if (!hasDatabase) {
    return c.json(buildLocalAccountState());
  }
  const accountId = c.get('userId');
  const state = await buildAccountState(accountId);
  // Billing disabled — return real data but never block the user
  if (!config.KORTIX_BILLING_INTERNAL_ENABLED) {
    state.credits.can_run = true;
  }
  return c.json(state);
});

accountStateRouter.get('/minimal', async (c) => {
  if (!hasDatabase) {
    return c.json(buildLocalAccountState());
  }
  const accountId = c.get('userId');
  const state = await buildMinimalAccountState(accountId);
  if (!config.KORTIX_BILLING_INTERNAL_ENABLED) {
    state.credits.can_run = true;
  }
  return c.json(state);
});
