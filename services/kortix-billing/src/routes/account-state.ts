import { Hono } from 'hono';
import type { AppEnv } from '../types/hono';
import { buildAccountState, buildMinimalAccountState } from '../services/account-state';

export const accountStateRouter = new Hono<AppEnv>();

accountStateRouter.get('/', async (c) => {
  const accountId = c.get('userId');
  const state = await buildAccountState(accountId);
  return c.json(state);
});

accountStateRouter.get('/minimal', async (c) => {
  const accountId = c.get('userId');
  const state = await buildMinimalAccountState(accountId);
  return c.json(state);
});
