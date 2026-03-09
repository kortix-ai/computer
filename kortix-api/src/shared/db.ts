import { createDb, type Database } from '@kortix/db';
import { config } from '../config';

/**
 * Database availability flag.
 * Check this before importing any DB-dependent modules.
 */
export const hasDatabase: boolean = !!config.DATABASE_URL;

/**
 * Database connection.
 *
 * In local mode without DATABASE_URL, this throws on first use.
 * All DB-dependent routes are only loaded when DATABASE_URL is set
 * (see index.ts conditional imports), so this is safe.
 *
 * Typed as non-null Database to avoid null-check noise in every consumer.
 * The runtime guard catches misconfiguration if it ever happens.
 */
export const db: Database = config.DATABASE_URL
  ? createDb(config.DATABASE_URL)
  : (new Proxy({} as Database, {
      get(_, prop) {
        throw new Error(
          `DATABASE_URL is not configured. Cannot access db.${String(prop)}. ` +
          `This route requires a database connection.`,
        );
      },
    }) as Database);
