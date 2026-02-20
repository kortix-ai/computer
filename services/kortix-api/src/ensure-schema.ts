/**
 * Ensures the database schema exists by running the idempotent init SQL.
 *
 * PostgreSQL's /docker-entrypoint-initdb.d/ scripts only run on first
 * database creation. If the postgres volume already has data (e.g. from a
 * previous install or upgrade), the init scripts are skipped and the schema
 * may be missing or outdated.
 *
 * This function runs the same idempotent SQL on every API startup, so the
 * schema is always up-to-date regardless of how postgres was initialized.
 *
 * All statements use IF NOT EXISTS / DO $$ EXCEPTION WHEN duplicate_object,
 * so running this against an already-initialized database is a safe no-op.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from './config';

export async function ensureSchema(): Promise<void> {
  if (!config.DATABASE_URL) {
    console.log('[migrate] No DATABASE_URL configured — skipping schema check');
    return;
  }

  const sqlPath = join(import.meta.dir, 'migrate.sql');
  let sql: string;
  try {
    sql = readFileSync(sqlPath, 'utf-8');
  } catch (err) {
    console.warn(`[migrate] Could not read ${sqlPath} — skipping schema migration`);
    return;
  }

  const client = postgres(config.DATABASE_URL, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    await client.unsafe(sql);
    console.log('[migrate] Schema ensured (idempotent init SQL applied)');
  } catch (err: any) {
    console.error('[migrate] Schema migration failed:', err.message || err);
    // Don't crash the API — some features may still work without the full schema.
    // The original behavior was to start without schema and fail on individual queries.
  } finally {
    await client.end();
  }
}
