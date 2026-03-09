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
  try {
    const state = await buildAccountState(accountId);
    // Billing disabled — return real data but never block the user
    if (!config.KORTIX_BILLING_INTERNAL_ENABLED) {
      state.credits.can_run = true;
    }
    return c.json(state);
  } catch {
    // DB schema may not have billing tables (e.g. local dev without kortix schema).
    // Fall back to local account state so the app isn't blocked.
    return c.json(buildLocalAccountState());
  }
});

accountStateRouter.get('/minimal', async (c) => {
  if (!hasDatabase) {
    return c.json(buildLocalAccountState());
  }
  const accountId = c.get('userId');
  try {
    const state = await buildMinimalAccountState(accountId);
    if (!config.KORTIX_BILLING_INTERNAL_ENABLED) {
      state.credits.can_run = true;
    }
    return c.json(state);
  } catch {
    return c.json(buildLocalAccountState());
  }
});
