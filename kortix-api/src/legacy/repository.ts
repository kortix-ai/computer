import postgres from 'postgres';
import { config } from '../config';
import type { LegacyThread, LegacyMessage } from './types';

function getSql() {
  return postgres(config.DATABASE_URL!, { max: 1 });
}

export async function getThreadsByAccount(
  accountId: string,
  limit: number,
  offset: number,
): Promise<{ threads: LegacyThread[]; total: number }> {
  const sql = getSql();
  try {
    const [countResult] = await sql`
      SELECT count(*)::int as total
      FROM threads
      WHERE account_id = ${accountId}
        AND (migrated_session_id IS NULL OR migrated_session_id = '')
    `;

    const threads = await sql<LegacyThread[]>`
      SELECT
        thread_id, account_id, project_id, name,
        created_at, updated_at,
        COALESCE(user_message_count, 0) as user_message_count,
        COALESCE(total_message_count, 0) as total_message_count,
        migrated_session_id
      FROM threads
      WHERE account_id = ${accountId}
        AND (migrated_session_id IS NULL OR migrated_session_id = '')
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { threads, total: countResult.total };
  } finally {
    await sql.end();
  }
}

export async function getThreadById(
  threadId: string,
  accountId: string,
): Promise<LegacyThread | null> {
  const sql = getSql();
  try {
    const [thread] = await sql<LegacyThread[]>`
      SELECT
        thread_id, account_id, project_id, name,
        created_at, updated_at,
        COALESCE(user_message_count, 0) as user_message_count,
        COALESCE(total_message_count, 0) as total_message_count,
        migrated_session_id
      FROM threads
      WHERE thread_id = ${threadId} AND account_id = ${accountId}
    `;
    return thread ?? null;
  } finally {
    await sql.end();
  }
}

export async function getMessagesByThread(threadId: string): Promise<LegacyMessage[]> {
  const sql = getSql();
  try {
    return await sql<LegacyMessage[]>`
      SELECT message_id, thread_id, type, is_llm_message, content, metadata, created_at
      FROM messages
      WHERE thread_id = ${threadId}
      ORDER BY created_at ASC
    `;
  } finally {
    await sql.end();
  }
}

export async function markThreadMigrated(
  threadId: string,
  sessionId: string,
): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE threads
      SET migrated_session_id = ${sessionId}
      WHERE thread_id = ${threadId}
    `;
  } finally {
    await sql.end();
  }
}

export async function ensureMigrationColumn(): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      ALTER TABLE threads
      ADD COLUMN IF NOT EXISTS migrated_session_id text
    `;
  } catch {
    // Column may already exist
  } finally {
    await sql.end();
  }
}
