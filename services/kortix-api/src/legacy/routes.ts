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

// ── Migrate All (background) ──────────────────────────────────────────────

interface MigrateAllJob {
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  failed: number;
  errors: string[];
}

const migrateAllJobs = new Map<string, MigrateAllJob>();

legacyApp.post('/migrate-all', async (c: any) => {
  const accountId = c.get('userId') as string;
  const { sandboxExternalId } = await c.req.json<{ sandboxExternalId: string }>();

  if (!sandboxExternalId) {
    return c.json({ error: 'sandboxExternalId required' }, 400);
  }

  const existing = migrateAllJobs.get(accountId);
  if (existing?.status === 'running') {
    return c.json({ error: 'Migration already in progress', ...existing }, 409);
  }

  // Get all unmigrated threads
  const { threads } = await getThreadsByAccount(accountId, 500, 0);
  if (threads.length === 0) {
    return c.json({ status: 'done', total: 0, completed: 0, failed: 0, errors: [] });
  }

  const job: MigrateAllJob = { status: 'running', total: threads.length, completed: 0, failed: 0, errors: [] };
  migrateAllJobs.set(accountId, job);

  // Process in background
  (async () => {
    for (const thread of threads) {
      try {
        if (thread.migrated_session_id) {
          job.completed++;
          continue;
        }
        const legacyMessages = await getMessagesByThread(thread.thread_id);
        const session = transformThread(thread.name, thread.created_at, thread.updated_at);
        const { messages, parts } = transformMessages(session, legacyMessages);
        const realSessionId = await writeSessionToSandbox(sandboxExternalId, session, messages, parts);
        await markThreadMigrated(thread.thread_id, realSessionId);
        job.completed++;
        console.log(`[legacy] Migrated ${job.completed}/${job.total}: ${thread.thread_id}`);
      } catch (err: any) {
        job.failed++;
        job.errors.push(`${thread.thread_id}: ${err.message}`);
        console.error(`[legacy] Failed to migrate ${thread.thread_id}:`, err.message);
      }
    }
    job.status = 'done';
    console.log(`[legacy] Migrate-all complete: ${job.completed} ok, ${job.failed} failed`);
  })();

  return c.json(job);
});

legacyApp.get('/migrate-all/status', async (c: any) => {
  const accountId = c.get('userId') as string;
  const job = migrateAllJobs.get(accountId);
  if (!job) {
    return c.json({ status: 'idle', total: 0, completed: 0, failed: 0, errors: [] });
  }
  return c.json(job);
});

ensureMigrationColumn().catch((err) =>
  console.error('[legacy] Failed to add migrated_session_id column:', err),
);
