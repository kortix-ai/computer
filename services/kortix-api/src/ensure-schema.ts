/**
 * Ensures the database schema is up-to-date.
 *
 * Sequence:
 *   1. Run bootstrap migration (schemas, extensions, schema-level grants)
 *   2. `drizzle-kit push` (tables, indexes, enums — Drizzle-native)
 *   3. Run post-push migrations (table grants, atomic credit functions)
 *
 * SQL migrations live in supabase/migrations/ as individual files.
 * Each file contains a single statement so both `supabase db reset`
 * and this runner can execute them without prepared-statement issues.
 *
 * In production (INTERNAL_KORTIX_ENV=prod), schema is managed by external
 * migration pipelines, so this is a no-op.
 */

import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { config } from './config';
import postgres from 'postgres';

export async function ensureSchema(): Promise<void> {
  if (!config.DATABASE_URL) {
    console.log('[schema] No DATABASE_URL configured — skipping');
    return;
  }

  // Production: schema managed externally (CI/CD migrations)
  if (config.INTERNAL_KORTIX_ENV === 'prod') {
    console.log('[schema] Production mode — skipping auto-push (managed externally)');
    return;
  }

  const migrationsDir = join(import.meta.dir, '../../../supabase/migrations');

  // Step 1: Run bootstrap migration (schemas, extensions, grants)
  console.log('[schema] Running bootstrap migration...');
  await runSqlFile(join(migrationsDir, '00000000000000_bootstrap.sql'));

  // Step 2: drizzle-kit push (tables, indexes, enums)
  console.log('[schema] Pushing schema to database...');
  const dbPkgRoot = join(import.meta.dir, '../../../packages/db');
  const configPath = join(dbPkgRoot, 'drizzle.config.ts');

  const proc = Bun.spawn(
    ['bun', 'drizzle-kit', 'push', '--force', '--config', configPath],
    {
      cwd: dbPkgRoot,
      env: {
        ...process.env,
        DATABASE_URL: config.DATABASE_URL,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error('[schema] Push failed (exit', exitCode + ')');
    if (stdout.trim()) console.error('[schema] stdout:', stdout.trim());
    if (stderr.trim()) console.error('[schema] stderr:', stderr.trim());
    return; // Don't run post-push if push failed
  }

  console.log('[schema] Schema pushed successfully');
  if (stdout.trim()) {
    const summary = stdout.trim().split('\n').filter((l: string) =>
      l.includes('changes applied') || l.includes('CREATE') || l.includes('ALTER') || l.includes('No changes')
    );
    if (summary.length) console.log('[schema]', summary.join(' | '));
  }

  // Step 3: Run all post-push migrations (table grants, atomic functions)
  // Each file is executed individually to avoid prepared-statement limits.
  console.log('[schema] Running post-push migrations...');
  const postPushFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && f > '00000000000000_bootstrap.sql')
    .sort();

  for (const file of postPushFiles) {
    await runSqlFile(join(migrationsDir, file));
  }

  console.log('[schema] All migrations complete');
}

/**
 * Execute a raw SQL file against the database.
 * Uses postgres.js for direct connection (not Supabase client).
 */
async function runSqlFile(filePath: string): Promise<void> {
  const fileName = filePath.split('/').pop();
  let sql: string;
  try {
    sql = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`[schema] Migration file not found: ${fileName} — skipping`);
    return;
  }

  const db = postgres(config.DATABASE_URL!, { max: 1 });
  try {
    await db.unsafe(sql);
    console.log(`[schema] ✓ ${fileName}`);
  } catch (err: any) {
    // pg_cron/pg_net extensions may not exist in local dev — that's OK
    if (err.message?.includes('pg_cron') || err.message?.includes('pg_net')) {
      console.log(`[schema] ⚠ ${fileName}: pg_cron/pg_net extension not available (OK for local dev)`);
    } else {
      console.error(`[schema] ✗ ${fileName}:`, err.message || err);
    }
  } finally {
    await db.end();
  }
}
