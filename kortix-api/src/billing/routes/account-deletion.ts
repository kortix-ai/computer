import { Hono } from 'hono';
import {
  requestAccountDeletion,
  getAccountDeletionStatus,
  cancelAccountDeletion,
  deleteAccountImmediately,
} from '../services/account-deletion';

export const accountDeletionRouter = new Hono();

accountDeletionRouter.get('/deletion-status', async (c: any) => {
  const accountId = c.get('userId') as string;
  const result = await getAccountDeletionStatus(accountId);
  return c.json(result);
});

accountDeletionRouter.post('/request-deletion', async (c: any) => {
  const accountId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const result = await requestAccountDeletion(accountId, accountId, body.reason);
  return c.json(result);
});

accountDeletionRouter.post('/cancel-deletion', async (c: any) => {
  const accountId = c.get('userId') as string;
  const result = await cancelAccountDeletion(accountId);
  return c.json(result);
});

accountDeletionRouter.delete('/delete-immediately', async (c: any) => {
  const accountId = c.get('userId') as string;
  const result = await deleteAccountImmediately(accountId);
  return c.json(result);
});
