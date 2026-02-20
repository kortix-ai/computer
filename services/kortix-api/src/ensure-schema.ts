/**
 * Ensures the database schema is up-to-date using Drizzle migrations.
 *
 * In local mode (Docker installer), runs pending drizzle migrations on
 * every API startup. This handles the case where the postgres volume
 * already has data but is missing newer schema changes.
 *
 * In cloud mode, migrations are managed externally (CI/CD, Supabase
 * dashboard) so this is a no-op.
 *
 * Single source of truth: packages/db/src/schema/kortix.ts + drizzle migrations.
 */

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from './config';

export async function ensureSchema(): Promise<void> {
  if (!config.DATABASE_URL) {
    console.log('[migrate] No DATABASE_URL configured — skipping');
    return;
  }

  // Only run in local mode — cloud DB has its own migration pipeline
  if (!config.isLocal()) {
    return;
  }

  const migrationsFolder = join(import.meta.dir, '../../../packages/db/drizzle');

  const client = postgres(config.DATABASE_URL, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
  });

  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder });
    console.log('[migrate] Drizzle migrations applied');
  } catch (err: any) {
    console.error('[migrate] Migration failed:', err.message || err);
  } finally {
    await client.end();
  }
}
