/**
 * Ensures the database schema is up-to-date using `drizzle-kit push`.
 *
 * This is the Prisma-style "declarative" approach: the schema definitions
 * in packages/db/src/schema/ are the single source of truth.
 * On every local-mode startup, we diff the live DB against the schema
 * and apply any changes — no migration files needed.
 *
 * drizzle.config.ts has schemaFilter: ['kortix', 'public'] so it pushes
 * both the kortix schema tables AND the public schema billing tables.
 *
 * In cloud mode, migrations are managed externally so this is a no-op.
 */

import { join } from 'node:path';
import { config } from './config';

export async function ensureSchema(): Promise<void> {
  if (!config.DATABASE_URL) {
    console.log('[schema] No DATABASE_URL configured — skipping');
    return;
  }

  // Only run in local mode — cloud DB has its own migration pipeline
  if (!config.isLocal()) {
    return;
  }

  console.log('[schema] Pushing schema to database...');

  const dbPkgRoot = join(import.meta.dir, '../../../packages/db');
  const configPath = join(dbPkgRoot, 'drizzle.config.ts');

  // Use bun to run drizzle-kit from the root node_modules (packages/db has
  // no local node_modules in the production image). The --config flag points
  // at the config in packages/db which references schema files relative to itself.
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
  } else {
    console.log('[schema] Schema pushed successfully');
    if (stdout.trim()) {
      // Log just the summary lines, not verbose output
      const summary = stdout.trim().split('\n').filter(l => l.includes('changes applied') || l.includes('CREATE') || l.includes('ALTER') || l.includes('No changes'));
      if (summary.length) console.log('[schema]', summary.join(' | '));
    }
  }
}
