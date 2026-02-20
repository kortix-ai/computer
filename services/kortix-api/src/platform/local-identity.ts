import { config } from '../config';
import { hasDatabase, db } from '../shared/db';
import { sandboxes } from '@kortix/db';

/** Deterministic UUID for the local account (already used across the codebase). */
export const LOCAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';

/** Deterministic UUID for the local sandbox DB record. */
export const LOCAL_SANDBOX_ID = '00000000-0000-0000-0000-000000000001';

/** Docker container name — used for DNS resolution and external_id. */
export const LOCAL_SANDBOX_NAME = 'kortix-sandbox';

/**
 * Ensure the local sandbox has a record in the `kortix.sandboxes` table.
 *
 * Safe to call repeatedly — uses `onConflictDoNothing()` so it won't
 * overwrite an existing record if the user has customized sandbox settings.
 *
 * No-ops when:
 *   - Not in local mode
 *   - No DATABASE_URL configured
 */
export async function bootstrapLocalIdentity(): Promise<void> {
  if (!config.isLocal() || !hasDatabase) return;

  try {
    await db.insert(sandboxes).values({
      sandboxId: LOCAL_SANDBOX_ID,
      accountId: LOCAL_ACCOUNT_ID,
      name: LOCAL_SANDBOX_NAME,
      provider: 'local_docker',
      externalId: LOCAL_SANDBOX_NAME,
      status: 'active',
      baseUrl: `http://${LOCAL_SANDBOX_NAME}:${config.PORT}`,
    }).onConflictDoNothing();

    console.log('[LOCAL-IDENTITY] Bootstrap complete — sandbox record ensured');
  } catch (err) {
    console.error('[LOCAL-IDENTITY] Bootstrap failed (non-fatal):', err);
  }
}
