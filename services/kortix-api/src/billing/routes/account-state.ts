import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { buildAccountState, buildMinimalAccountState, buildLocalAccountState } from '../services/account-state';
import { hasDatabase } from '../../shared/db';

export const accountStateRouter = new Hono<AppEnv>();

accountStateRouter.get('/', async (c) => {
  if (!hasDatabase) {
    return c.json(buildLocalAccountState());
  }
  const accountId = c.get('userId');
  const state = await buildAccountState(accountId);
  return c.json(state);
});

accountStateRouter.get('/minimal', async (c) => {
  if (!hasDatabase) {
    return c.json(buildLocalAccountState());
  }
  const accountId = c.get('userId');
  const state = await buildMinimalAccountState(accountId);
  return c.json(state);
});
