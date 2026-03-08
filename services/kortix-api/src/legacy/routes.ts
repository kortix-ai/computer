import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import {
  getThreadsByAccount,
  getThreadById,
  getMessagesByThread,
  markThreadMigrated,
  ensureMigrationColumn,
} from './repository';
import { transformThread, transformMessages } from './transformer';
import { writeSessionToSandbox } from './sandbox-writer';
import type { MigrationResult } from './types';

export const legacyApp = new Hono();

legacyApp.use('*', supabaseAuth);

legacyApp.get('/threads', async (c: any) => {
  const accountId = c.get('userId') as string;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const { threads, total } = await getThreadsByAccount(accountId, limit, offset);

  return c.json({ threads, total, limit, offset });
});

legacyApp.get('/threads/:threadId', async (c: any) => {
  const accountId = c.get('userId') as string;
  const threadId = c.req.param('threadId');

  const thread = await getThreadById(threadId, accountId);
  if (!thread) return c.json({ error: 'Thread not found' }, 404);

  return c.json(thread);
});

legacyApp.get('/threads/:threadId/messages', async (c: any) => {
  const accountId = c.get('userId') as string;
  const threadId = c.req.param('threadId');

  const thread = await getThreadById(threadId, accountId);
  if (!thread) return c.json({ error: 'Thread not found' }, 404);

  const messages = await getMessagesByThread(threadId);

  return c.json({ messages });
});

legacyApp.post('/threads/:threadId/migrate', async (c: any) => {
  const accountId = c.get('userId') as string;
  const threadId = c.req.param('threadId');
  const { sandboxExternalId } = await c.req.json<{ sandboxExternalId: string }>();

  if (!sandboxExternalId) {
    return c.json({ error: 'sandboxExternalId required' }, 400);
  }

  const thread = await getThreadById(threadId, accountId);
  if (!thread) return c.json({ error: 'Thread not found' }, 404);

  if (thread.migrated_session_id) {
    return c.json({ error: 'Thread already migrated', sessionId: thread.migrated_session_id }, 409);
  }

  const legacyMessages = await getMessagesByThread(threadId);

  const session = transformThread(thread.name, thread.created_at, thread.updated_at);
  const { messages, parts } = transformMessages(session, legacyMessages);

  const realSessionId = await writeSessionToSandbox(sandboxExternalId, session, messages, parts);
  await markThreadMigrated(threadId, realSessionId);

  const result: MigrationResult = {
    sessionId: realSessionId,
    messagesImported: messages.length,
    partsImported: parts.length,
  };

  return c.json(result);
});

ensureMigrationColumn().catch((err) =>
  console.error('[legacy] Failed to add migrated_session_id column:', err),
);
